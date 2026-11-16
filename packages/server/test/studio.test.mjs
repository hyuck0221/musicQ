import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import WebSocket from "ws";
import { createApp } from "../src/app.mjs";
import { planMusic, requestSchema } from "../src/planner.mjs";

const waitFor = async (predicate) => {
  const until = Date.now() + 10000;
  while (Date.now() < until) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("Timed out waiting for state");
};
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "musicq-test-"));
  const config = {
    dir,
    timeout: 10,
  };
  const app = await createApp(config);
  t.after(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  const req = async (method, url, payload) => {
    const res = await app.inject({
      method,
      url,
      payload,
    });
    return {
      status: res.statusCode,
      body: res.headers["content-type"]?.includes("application/json")
        ? res.json()
        : res.body,
      raw: res.rawPayload,
      headers: res.headers,
    };
  };
  return { app, config, dir, req };
}
test("volume works without a selected track and playback stays in the browser", async (t) => {
  const { app, req } = await fixture(t);
  const result = await req("PATCH", "/api/player", { volume: 0.35 });
  assert.equal(result.status, 200);
  assert.equal(result.body.volume, 0.35);
  assert.equal(result.body.trackId, null);
  assert.equal(result.body.playing, false);
  assert.equal(result.body.target, "browser");
  assert.equal((await req("PATCH", "/api/player", { volume: 0 })).status, 200);
  assert.equal(app.music.player.volume, 0);
  assert.equal((await req("PATCH", "/api/player", { volume: 1.1 })).status, 400);
  assert.equal((await req("PATCH", "/api/player", { target: "server" })).status, 400);
  assert.equal((await req("PATCH", "/api/player", { playing: true })).status, 400);
  assert.equal(app.music.player.volume, 0);
});

test("intent plan computes scores before inference, respects explicit overrides and seed", () => {
  const input = requestSchema.parse({
    prompt: "warm and calm piano",
    mood: "따뜻한",
    scores: { energy: 17 },
  });
  const p = planMusic(input, 42);
  assert.equal(p.scores.energy, 17);
  assert.equal(p.scores.warmth, 95);
  assert.equal(p.seed, 42);
  assert.match(p.resolvedPrompt, /energy: 17\/100/);
  assert.throws(() => requestSchema.parse({ mode: "prompt", prompt: "" }));
});
test("same-origin API needs no key; foreign origins, invalid input and unknown models are rejected", async (t) => {
  const { app, req } = await fixture(t);
  assert.equal((await app.inject("/api/state")).statusCode, 200);
  assert.equal((await app.inject({url: "/api/state", headers: {origin: "http://localhost:80"}})).statusCode, 200);
  assert.equal((await app.inject({method: "POST", url: "/api/queue", headers: {"sec-fetch-site": "cross-site"}, payload: {duration: 5}})).statusCode, 403);
  assert.equal(
    (
      await app.inject({
        url: "/api/state",
        headers: {
          origin: "https://untrusted.example",
        },
      })
    ).statusCode,
    403,
  );
  assert.equal((await req("POST", "/api/queue", { duration: -1 })).status, 400);
  assert.equal(
    (await req("POST", "/api/queue", { modelId: "not-installed" })).status,
    400,
  );
  assert.equal(
    (await req("GET", "/api/state")).body.models[0].status,
    "installed",
  );
});
test("queue order and pause survive restart; stale reorders are rejected", async (t) => {
  const { app, req, config } = await fixture(t);
  await req("PATCH", "/api/queue", { paused: true });
  const a = (await req("POST", "/api/queue", { title: "A", duration: 5 })).body;
  const b = (await req("POST", "/api/queue", { title: "B", duration: 5 })).body;
  assert.equal(
    (await req("POST", "/api/queue/reorder", { ids: [b.id, b.id] })).status,
    400,
  );
  await req("POST", "/api/queue/reorder", { ids: [b.id, a.id] });
  const second = await createApp(config);
  t.after(() => second.close());
  assert.equal(second.music.paused, true);
  assert.deepEqual(
    second.music.jobs.map((j) => j.id),
    [b.id, a.id],
  );
});
test("generation persists planned metadata; WAV without signed URLs supports ranges, search, replay and deletion", async (t) => {
  const { app, req } = await fixture(t);
  const job = (
    await req("POST", "/api/queue", {
      title: "Warm desk",
      genre: "Jazz",
      duration: 5,
      scores: { energy: 21 },
    })
  ).body;
  await waitFor(
    () => app.music.jobs.find((j) => j.id === job.id)?.status === "completed",
  );
  const state = (await req("GET", "/api/state")).body;
  const track = state.tracks[0];
  assert.equal(track.scores.energy, 21);
  assert.ok(track.seed >= 0);
  assert.equal(
    (await req("GET", "/api/library?search=desk&genre=Jazz")).body.length,
    1,
  );
  assert.equal((await req("GET", "/api/library?minEnergy=50")).body.length, 0);
  const audio = await app.inject(track.mediaPath);
  assert.equal(audio.statusCode, 200);
  assert.equal(audio.rawPayload.toString("ascii", 0, 4), "RIFF");
  const ranged = await app.inject({
    url: track.mediaPath,
    headers: { range: "bytes=0-43" },
  });
  assert.equal(ranged.statusCode, 206);
  assert.equal(ranged.rawPayload.length, 44);
  assert.equal(
    (
      await app.inject({
        url: track.mediaPath,
        headers: { range: "bytes=9999999-" },
      })
    ).statusCode,
    416,
  );
  assert.equal(track.mediaPath, `/api/audio/${track.id}`);
  await req("PATCH", "/api/player", {
    trackId: track.id,
    playing: true,
    position: 2,
  });
  assert.equal(app.music.player.playing, true);
  await req("PATCH", "/api/queue", { paused: true });
  const regenerated = (await req("POST", `/api/library/${track.id}/regenerate`))
    .body;
  assert.equal(regenerated.parentId, track.id);
  assert.equal(regenerated.request.seed, undefined);
  assert.equal(regenerated.request.scores.energy, 21);
  await req("DELETE", `/api/library/${track.id}`);
  assert.equal(app.music.player.trackId, null);
  assert.equal(app.music.tracks.length, 0);
});
test("active cancellation kills inference and leaves following work paused", async (t) => {
  const { app, req } = await fixture(t);
  const a = (await req("POST", "/api/queue", { duration: 5 })).body;
  const b = (await req("POST", "/api/queue", { duration: 5 })).body;
  await waitFor(() => app.music.active?.id === a.id);
  await new Promise((resolve) => setTimeout(resolve, 250));
  await req("POST", `/api/queue/${a.id}/cancel`);
  await waitFor(() => !app.music.active);
  assert.equal(app.music.jobs.find((j) => j.id === a.id).status, "cancelled");
  assert.equal(app.music.jobs.find((j) => j.id === b.id).status, "queued");
  assert.equal(app.music.paused, true);
  assert.equal(app.music.tracks.length, 0);
});
test("WebSocket sends state immediately without a key and rejects foreign origins", async (t) => {
  const { app, req } = await fixture(t);
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  const bad = new WebSocket(address.replace("http", "ws") + "/ws", { origin: "https://untrusted.example" });
  bad.on("error", () => {});
  const [, response] = await once(bad, "unexpected-response");
  assert.equal(response.statusCode, 403);
  bad.terminate();
  const ws = new WebSocket(address.replace("http", "ws") + "/ws", { origin: address });
  t.after(() => ws.terminate());
  const initial = once(ws, "message");
  await once(ws, "open");
  assert.equal(JSON.parse((await initial)[0]).jobs.length, 0);
  const pushed = once(ws, "message");
  await req("PATCH", "/api/queue", { paused: true });
  assert.equal(JSON.parse((await pushed)[0]).paused, true);
  ws.close();
  await once(ws, "close");
});
test("model installation state, usage guard, and uninstall work without downloading weights", async (t) => {
  const { app, req, dir } = await fixture(t);
  const fakePython = join(dir, "fake-python");
  await writeFile(
    fakePython,
    '#!/bin/sh\necho "installing fixture"\nsleep 0.2\n',
  );
  await chmod(fakePython, 0o700);
  const previous = process.env.MUSICQ_PYTHON;
  process.env.MUSICQ_PYTHON = fakePython;
  t.after(() => {
    if (previous === undefined) delete process.env.MUSICQ_PYTHON;
    else process.env.MUSICQ_PYTHON = previous;
  });
  assert.equal(
    (await req("POST", "/api/models/musicgen-small/install")).status,
    200,
  );
  assert.equal(
    (await req("POST", "/api/models/musicgen-medium/install")).status,
    400,
  );
  await waitFor(
    () =>
      app.music.models.list().find((m) => m.id === "musicgen-small").status ===
      "installed",
  );
  await req("PATCH", "/api/queue", { paused: true });
  const job = (
    await req("POST", "/api/queue", { modelId: "musicgen-small", duration: 5 })
  ).body;
  assert.equal((await req("DELETE", "/api/models/musicgen-small")).status, 400);
  await req("DELETE", `/api/queue/${job.id}`);
  assert.equal((await req("DELETE", "/api/models/musicgen-small")).status, 200);
  assert.equal(
    app.music.models.list().find((m) => m.id === "musicgen-small").status,
    "available",
  );
});

test("modern model catalog dispatches to isolated runtimes and validates ACE duration", async (t) => {
  const { app, req } = await fixture(t);
  const models = (await req("GET", "/api/state")).body.models;
  const xl = models.find((m) => m.id === "ace-step-15-xl-sft");
  assert.equal(xl.parameters, "DiT 4B + LM 4B");
  assert.equal(xl.minDuration, 10);
  assert.ok(
    !models.some((m) => m.id.includes("small-sfx") || m.name.includes("7B")),
  );
  app.music.models.registry[xl.id] = { status: "installed" };
  app.music.models.registry["stable-audio-3-medium"] = { status: "installed" };
  assert.match(
    app.music.models.resolve(xl.id).command[0],
    /runtimes\/ace-step-15\/source\/\.venv\/bin\/python$/,
  );
  assert.match(
    app.music.models.resolve("stable-audio-3-medium").command[0],
    /runtimes\/stable-audio-3\/source\/\.venv\/bin\/python$/,
  );
  await req("PATCH", "/api/queue", { paused: true });
  assert.equal(
    (await req("POST", "/api/queue", { modelId: xl.id, duration: 5 })).status,
    400,
  );
  assert.equal(
    (await req("POST", "/api/queue", { modelId: xl.id, duration: 15 })).status,
    200,
  );
});

test("model failure strips terminal color codes from the user-visible error", async (t) => {
  const { dir } = await fixture(t);
  const { generate } = await import("../src/engine.mjs");
  const coloredError = "\u001b[31mAttributeError: bad config\u001b[0m\n";
  await assert.rejects(
    generate({}, join(dir, "failure.wav"), new AbortController().signal, {
      engine: "command",
      timeout: 5,
      command: [
        process.execPath,
        "-e",
        `process.stderr.write(${JSON.stringify(coloredError)}); process.exit(1)`,
      ],
    }),
    (error) =>
      error.message === "모델 실행 실패 (1): AttributeError: bad config" &&
      !error.message.includes("\u001b"),
  );
});

test("library HTTP endpoint applies appended filters and returns validation errors", async (t) => {
  const { app, req } = await fixture(t);
  app.music.tracks.push(
    {
      id: "filter-one",
      ...planMusic(
        requestSchema.parse({
          genre: "Jazz",
          duration: 17,
          bpm: 83,
          scores: { energy: 65 },
        }),
        1,
      ),
      createdAt: 1,
    },
    {
      id: "filter-two",
      ...planMusic(
        requestSchema.parse({
          genre: "Jazz",
          duration: 23,
          bpm: 98,
          scores: { energy: 25 },
        }),
        2,
      ),
      createdAt: 2,
    },
  );
  const filters = [
    { field: "genre", op: "eq", value: "Jazz" },
    { field: "duration", op: "between", value: 16, valueTo: 24 },
    { field: "energy", op: "gte", value: 60 },
  ];
  const result = await req(
    "GET",
    "/api/library?" + new URLSearchParams({ filters: JSON.stringify(filters) }),
  );
  assert.equal(result.status, 200);
  assert.deepEqual(
    result.body.map((track) => track.id),
    ["filter-one"],
  );
  assert.equal((await req("GET", "/api/library?filters=%7B")).status, 400);
});
