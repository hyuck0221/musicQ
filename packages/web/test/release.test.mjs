import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

test("release contains the built panel and server without local data or credentials", async (t) => {
  const output = await mkdtemp(join(tmpdir(), "musicq-release-test-"));
  t.after(() => rm(output, { recursive: true, force: true }));
  await exec("npm", ["run", "package:server"], {
    cwd: root, env: { ...process.env, MUSICQ_RELEASE_OUTPUT: output },
  });
  const archive = join(output, "musicq-server.tar.gz");
  const bytes = await readFile(archive);
  const version = JSON.parse(await readFile(join(output, "version.json"), "utf8"));
  assert.equal(version.sha256, createHash("sha256").update(bytes).digest("hex"));
  const listing = (await exec("tar", ["-tzf", archive])).stdout.split("\n").filter(Boolean);
  for (const file of ["packages/server/src/index.mjs", "packages/server/src/modern-model.py",
    "packages/server/web/index.html", "packages/server/Dockerfile", "packages/web/package.json",
    "scripts/install-macos.sh", "scripts/copy-web.mjs", "compose.yaml", "package-lock.json"])
    assert.ok(listing.includes("musicq-server/" + file), file);
  assert.ok(listing.some(file => /packages\/server\/web\/assets\/.*\.js$/.test(file)));
  assert.ok(!listing.some(file => /(^|\/)(\.musicq|node_modules|__pycache__|\.git)(\/|$)/.test(file) || /(^|\/)\.env$/.test(file)));
  assert.ok(!listing.some(file => /vercel|install\.sh$/.test(file)));
});
