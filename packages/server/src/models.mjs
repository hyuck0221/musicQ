import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { catalog } from "./catalog.mjs";
export { catalog } from "./catalog.mjs";
export class ModelManager {
  constructor(dir, changed, customCommand) {
    this.dir = join(dir, "models");
    mkdirSync(this.dir, { recursive: true });
    this.changed = changed;
    this.customCommand = customCommand;
    this.localModels = process.env.MUSICQ_MODELS_FILE
      ? JSON.parse(readFileSync(process.env.MUSICQ_MODELS_FILE, "utf8"))
      : [];
    if (
      !Array.isArray(this.localModels) ||
      this.localModels.some(
        (m) =>
          !/^local-[a-z0-9-]+$/.test(m.id) ||
          typeof m.name !== "string" ||
          !Array.isArray(m.command) ||
          !m.command.length ||
          m.command.some((v) => typeof v !== "string") ||
          !Number.isInteger(m.maxDuration) ||
          m.maxDuration < 5 ||
          m.maxDuration > 300,
      ) ||
      new Set(this.localModels.map((m) => m.id)).size !==
        this.localModels.length
    )
      throw new Error("MUSICQ_MODELS_FILE 형식을 확인해 주세요");
    this.file = join(this.dir, "registry.json");
    this.registry = existsSync(this.file)
      ? JSON.parse(readFileSync(this.file, "utf8"))
      : {};
    for (const item of Object.values(this.registry))
      if (item.status === "installing") {
        item.status = "failed";
        item.error = "서버 재시작으로 설치가 중단되었습니다";
      }
    this.save();
  }
  save() {
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.registry));
    renameSync(`${this.file}.tmp`, this.file);
  }
  list() {
    return [
      {
        id: "demo",
        name: "테스트 신시사이저",
        status: "installed",
        description: "연결·큐 검증용 합성음 · AI 모델 아님",
        size: "내장",
        maxDuration: 300,
      },
      ...(this.customCommand
        ? [
            {
              id: "custom",
              name: process.env.MUSICQ_MODEL_NAME || "사용자 모델",
              status: "installed",
              description: "서버 명령 어댑터",
              size: "외부",
              maxDuration: 300,
            },
          ]
        : []),
      ...this.localModels.map((m) => ({
        id: m.id,
        name: m.name,
        status: "installed",
        description: "서버에 등록된 로컬 음악 모델",
        size: "외부",
        maxDuration: m.maxDuration,
      })),
      ...catalog.map((m) => ({
        ...m,
        status: "available",
        ...this.registry[m.id],
      })),
    ];
  }
  resolve(id) {
    const m = this.list().find((m) => m.id === id);
    if (!m || m.status !== "installed")
      throw new Error("설치된 모델을 선택해 주세요");
    const local = this.localModels.find((m) => m.id === id);
    if (local) return { engine: "command", command: local.command };
    if (id === "demo") return { engine: "demo" };
    if (id === "custom")
      return { engine: "command", command: this.customCommand };
    const model = catalog.find((m) => m.id === id);
    if (model.family !== "musicgen")
      return {
        engine: "command",
        command: [
          join(
            this.dir,
            "runtimes",
            model.runtime,
            "source",
            ".venv",
            "bin",
            "python",
          ),
          fileURLToPath(new URL("./modern-model.py", import.meta.url)),
          join(this.dir, id),
        ],
      };
    return {
      engine: "command",
      command: [
        join(this.dir, "venv", "bin", "python"),
        fileURLToPath(new URL("./musicgen.py", import.meta.url)),
        join(this.dir, id),
      ],
    };
  }

  install(id) {
    const model = catalog.find((m) => m.id === id);
    if (!model) throw new Error("설치할 수 없는 모델입니다");
    if (this.installing) throw new Error("다른 모델의 설치가 진행 중입니다");
    if (this.registry[id]?.status === "installed")
      throw new Error("이미 설치된 모델입니다");
    this.registry[id] = {
      status: "installing",
      phase: "Python 환경 준비",
      error: null,
    };
    this.save();
    this.changed();
    const script = fileURLToPath(
      new URL("./install-model.py", import.meta.url),
    );
    const child = spawn(
      process.env.MUSICQ_PYTHON ||
        ["python3.12", "python3.11", "python3"].find(
          (command) =>
            spawnSync(command, ["--version"], { stdio: "ignore" }).status === 0,
        ) ||
        "python3",
      [script, this.dir, JSON.stringify(model)],
      { detached: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    this.installing = { id, child, cancelled: false };
    let error = "";
    child.stdout.on("data", (data) => {
      this.registry[id].phase = data
        .toString()
        .trim()
        .split("\n")
        .at(-1)
        .slice(0, 160);
      this.save();
      this.changed();
    });
    child.stderr.on("data", (data) => {
      error = (error + data).slice(-1600);
    });
    child.on("error", (e) => {
      error = e.message;
    });
    child.on("close", (code) => {
      const cancelled = this.installing?.cancelled;
      this.installing = null;
      this.registry[id] =
        code === 0 && !cancelled
          ? { status: "installed", phase: "", installedAt: Date.now() }
          : {
              status: "failed",
              phase: "",
              error: cancelled ? "설치가 취소되었습니다" : error || "설치 실패",
            };
      this.save();
      this.changed();
    });
  }
  cancel(id) {
    if (this.installing?.id !== id)
      throw new Error("설치 중인 모델이 아닙니다");
    this.installing.cancelled = true;
    try {
      process.kill(-this.installing.child.pid, "SIGTERM");
    } catch (e) {
      if (e.code !== "ESRCH") throw e;
    }
    const pid = this.installing.child.pid;
    const timer = setTimeout(() => {
      if (this.installing?.child.pid === pid) {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          /* exited */
        }
      }
    }, 3000);
    timer.unref();
  }
  remove(id) {
    if (!catalog.some((m) => m.id === id))
      throw new Error("내장·사용자 모델은 웹에서 삭제할 수 없습니다");
    if (this.installing)
      throw new Error("설치 완료 또는 취소 후 삭제해 주세요");
    rmSync(join(this.dir, id), { recursive: true, force: true });
    delete this.registry[id];
    this.save();
    this.changed();
  }
  close() {
    if (this.installing) this.cancel(this.installing.id);
  }
}
