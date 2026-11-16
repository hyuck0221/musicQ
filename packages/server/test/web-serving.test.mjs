import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app.mjs";

test("one server serves the panel, SPA paths, assets and unauthenticated API", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "musicq-web-"));
  const webRoot = join(dir, "panel");
  await mkdir(join(webRoot, "assets"), { recursive: true });
  await writeFile(join(webRoot, "index.html"), "<!doctype html><title>musicQ</title>");
  await writeFile(join(webRoot, "assets/panel.js"), "console.log('musicQ')");
  const app = await createApp({ dir, webRoot, timeout: 10 });
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
  const index = await app.inject("/");
  assert.equal(index.statusCode, 200);
  assert.match(index.headers["content-type"], /text\/html/);
  assert.equal(index.headers["cache-control"], "no-cache");
  assert.equal((await app.inject("/library")).body, index.body);
  assert.equal((await app.inject({url: "/", headers: {"sec-fetch-site": "cross-site"}})).statusCode, 200);
  const asset = await app.inject("/assets/panel.js");
  assert.match(asset.headers["content-type"], /javascript/);
  assert.match(asset.headers["cache-control"], /immutable/);
  for (const url of ["/assets/missing.js", "/api/missing", "/missing.css", "/.env", "/src/index.mjs"])
    assert.equal((await app.inject(url)).statusCode, 404, url);
  const state = await app.inject("/api/state");
  assert.equal(state.statusCode, 200);
  assert.ok(Array.isArray(state.json().models));
  assert.equal((await app.inject({url: "/api/state", headers: {origin: "http://foreign.example"}})).statusCode, 403);
});

test("missing frontend build reports the local build command", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "musicq-no-panel-"));
  const app = await createApp({ dir, webRoot: join(dir, "missing"), timeout: 10 });
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
  const res = await app.inject("/");
  assert.equal(res.statusCode, 503);
  assert.match(res.body, /npm run build/);
  assert.equal((await app.inject("/api/state")).statusCode, 200);
});
