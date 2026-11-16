import { DatabaseSync } from "node:sqlite";
import { EventEmitter } from "node:events";
import { mkdirSync, existsSync, unlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID, randomInt } from "node:crypto";
import { generate } from "./engine.mjs";
import { planMusic, requestSchema } from "./planner.mjs";
import { ModelManager } from "./models.mjs";

export class MusicService extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    mkdirSync(join(config.dir, "audio"), { recursive: true });
    this.db = new DatabaseSync(join(config.dir, "musicq.sqlite"));
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS tracks (id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, body TEXT NOT NULL);",
    );
    this.jobs = this.read("jobs");
    this.tracks = this.read("tracks");
    this.paused = JSON.parse(
      this.db.prepare("SELECT body FROM settings WHERE id='paused'").get()
        ?.body ?? "false",
    );
    for (const job of this.jobs)
      if (["running", "planning"].includes(job.status)) {
        job.status = "failed";
        job.error = "서버가 재시작되었습니다. 다시 큐에 등록해 주세요";
        this.save("jobs", job);
      }
    this.player = {
      trackId: null,
      playing: false,
      position: 0,
      updatedAt: Date.now(),
      target: "browser",
      volume: 0.8,
    };
    this.models = new ModelManager(
      config.dir,
      () => this.changed(),
      config.command,
    );
    this.closed = false;
    queueMicrotask(() => this.pump());
  }
  read(table) {
    return this.db
      .prepare(`SELECT body FROM ${table} ORDER BY rowid`)
      .all()
      .map((v) => JSON.parse(v.body));
  }
  save(table, item) {
    this.db
      .prepare(`INSERT OR REPLACE INTO ${table} (id,body) VALUES (?,?)`)
      .run(item.id, JSON.stringify(item));
  }
  changed() {
    this.emit("change");
  }
  snapshot() {
    return {
      jobs: this.jobs,
      tracks: this.tracks,
      paused: this.paused,
      player: this.player,
      models: this.models.list(),
      serverTime: Date.now(),
    };
  }
  enqueue(input, parentId = null) {
    const request = requestSchema.parse(input);
    this.models.resolve(request.modelId);
    const model = this.models.list().find((m) => m.id === request.modelId);
    if (request.duration < (model.minDuration ?? 5))
      throw new Error(
        `선택한 모델은 최소 ${model.minDuration}초부터 지원합니다`,
      );
    if (request.duration > model.maxDuration)
      throw new Error(
        `선택한 모델은 최대 ${model.maxDuration}초까지 지원합니다`,
      );
    const job = {
      id: randomUUID(),
      request,
      parentId,
      status: "queued",
      createdAt: Date.now(),
      plan: null,
      error: null,
    };
    this.jobs.push(job);
    this.save("jobs", job);
    this.changed();
    this.pump();
    return job;
  }
  setPaused(value) {
    this.paused = value;
    this.db
      .prepare("INSERT OR REPLACE INTO settings VALUES ('paused',?)")
      .run(JSON.stringify(value));
    this.changed();
    if (!value) this.pump();
  }
  reorder(ids) {
    const waiting = this.jobs.filter((j) => j.status === "queued");
    if (
      ids.length !== waiting.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !waiting.some((j) => j.id === id))
    )
      throw new Error("큐가 변경되었습니다. 다시 정렬해 주세요");
    const ordered = ids.map((id) => waiting.find((j) => j.id === id));
    let i = 0;
    this.jobs = this.jobs.map((j) =>
      j.status === "queued" ? ordered[i++] : j,
    );
    // Reinsert to persist display order across restarts (SQLite rowid).
    this.db.exec("BEGIN");
    try {
      this.db.exec("DELETE FROM jobs");
      for (const j of this.jobs) this.save("jobs", j);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    this.changed();
  }
  cancel(id) {
    const job = this.jobs.find((j) => j.id === id);
    if (!job || !["queued", "running", "planning"].includes(job.status))
      throw new Error("중단할 작업이 없습니다");
    if (this.active?.id === id) {
      this.setPaused(true);
      this.active.controller.abort();
    }
    job.status = "cancelled";
    this.save("jobs", job);
    this.changed();
  }
  removeJob(id) {
    const job = this.jobs.find((j) => j.id === id);
    if (!job) throw new Error("큐를 찾을 수 없습니다");
    if (this.active?.id === id)
      throw new Error("생성 중단이 완료된 후 삭제해 주세요");
    this.jobs = this.jobs.filter((j) => j.id !== id);
    this.db.prepare("DELETE FROM jobs WHERE id=?").run(id);
    this.changed();
  }
  async pump() {
    if (this.active || this.paused || this.closed) return;
    const job = this.jobs.find((j) => j.status === "queued");
    if (!job) return;
    const controller = new AbortController();
    this.active = { id: job.id, controller };
    const output = join(this.config.dir, "audio", `${job.id}.wav`);
    try {
      job.status = "planning";
      this.save("jobs", job);
      this.changed();
      job.plan = planMusic(
        job.request,
        job.request.seed ?? randomInt(2147483647),
      );
      job.startedAt = Date.now();
      job.status = "running";
      this.save("jobs", job);
      this.changed();
      await generate(job.plan, output, controller.signal, {
        ...this.config,
        ...this.models.resolve(job.request.modelId),
      });
      // Validate WAV header before making generated media available.
      const fd = readFileSync(output).subarray(0, 12);
      if (
        fd.toString("ascii", 0, 4) !== "RIFF" ||
        fd.toString("ascii", 8, 12) !== "WAVE"
      )
        throw new Error("모델 출력은 WAV 파일이어야 합니다");
      const track = {
        id: job.id,
        ...job.plan,
        createdAt: Date.now(),
        parentId: job.parentId,
        jobId: job.id,
      };
      this.tracks.unshift(track);
      this.save("tracks", track);
      job.status = "completed";
      job.finishedAt = Date.now();
    } catch (e) {
      job.status = controller.signal.aborted ? "cancelled" : "failed";
      job.error = controller.signal.aborted ? null : e.message;
      if (existsSync(output)) unlinkSync(output);
    } finally {
      if (existsSync(`${output}.json`)) unlinkSync(`${output}.json`);
      this.save("jobs", job);
      this.active = null;
      this.changed();
      if (!this.closed) queueMicrotask(() => this.pump());
    }
  }
  regenerate(id) {
    const track = this.tracks.find((t) => t.id === id);
    if (!track) throw new Error("음악을 찾을 수 없습니다");
    return this.enqueue(
      {
        ...track,
        title: `${track.title.replace(/ · 재생성$/, "").slice(0, 92)} · 재생성`,
        seed: undefined,
      },
      id,
    );
  }
  removeTrack(id) {
    if (!this.tracks.some((t) => t.id === id))
      throw new Error("음악을 찾을 수 없습니다");
    if (this.player.trackId === id) {
      clearTimeout(this.endTimer);
      this.player = {
        ...this.player,
        trackId: null,
        playing: false,
        position: 0,
      };
    }
    const path = this.audioPath(id);
    if (existsSync(path)) unlinkSync(path);
    this.tracks = this.tracks.filter((t) => t.id !== id);
    this.db.prepare("DELETE FROM tracks WHERE id=?").run(id);
    this.changed();
  }
  audioPath(id) {
    if (!this.tracks.some((t) => t.id === id))
      throw new Error("음악을 찾을 수 없습니다");
    return join(this.config.dir, "audio", `${id}.wav`);
  }
  updatePlayer(patch) {
    const now = Date.now();
    const previous = this.player;
    let position =
      previous.position +
      (previous.playing ? (now - previous.updatedAt) / 1000 : 0);
    if (patch.trackId && patch.trackId !== previous.trackId) position = 0;
    const next = {
      ...previous,
      error: undefined,
      ...patch,
      target: "browser",
      position: patch.position ?? position,
      updatedAt: now,
    };
    const track = this.tracks.find((t) => t.id === next.trackId);
    if (!track) {
      if (patch.trackId !== undefined || patch.playing !== undefined || patch.position !== undefined)
        throw new Error("재생할 음악을 선택해 주세요");
      this.player = next;
      this.changed();
      return this.player;
    }
    next.position = Math.max(0, Math.min(next.position, track.duration));
    if (next.position >= track.duration) {
      if (patch.playing === true && patch.position === undefined)
        next.position = 0;
      else next.playing = false;
    }
    clearTimeout(this.endTimer);
    this.player = next;
    if (next.playing)
      this.endTimer = setTimeout(
        () => {
          this.player = {
            ...this.player,
            playing: false,
            position: track.duration,
            updatedAt: Date.now(),
          };
          this.changed();
        },
        (track.duration - next.position) * 1000,
      );
    this.changed();
    return this.player;
  }
  async close() {
    this.closed = true;
    clearTimeout(this.endTimer);
    this.models.close();
    this.active?.controller.abort();
    if (this.active)
      await new Promise((resolve) => {
        const timer = setInterval(() => {
          if (!this.active) {
            clearInterval(timer);
            resolve();
          }
        }, 20);
      });
    this.db.close();
  }
}
