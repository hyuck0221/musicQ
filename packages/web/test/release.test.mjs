import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
function runInstaller(script, destination, base) {
  return new Promise((resolve) => {
    // The production installer downloads and verifies the archive; this mode never
    // registers LaunchAgents, installs packages, or changes the user's home directory.
    const child = spawn("bash", [script, "--download-only", destination], {
      env: { ...process.env, MUSICQ_DOWNLOAD_BASE: base },
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", (error) => resolve({ code: -1, output: error.message }));
    child.on("close", (code) => resolve({ code, output }));
  });
}

test("release archive and hosted installer download valid server files and reject corrupted checksums", async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "musicq-installer-test-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const output = join(temporary, "downloads");
  await exec(process.execPath, [join(root, "scripts/package-server.mjs")], {
    env: { ...process.env, MUSICQ_RELEASE_OUTPUT: output },
  });
  const bytes = await readFile(join(output, "musicq-server.tar.gz"));
  const checksum = await readFile(
    join(output, "musicq-server.tar.gz.sha256"),
    "utf8",
  );
  const version = JSON.parse(
    await readFile(join(output, "version.json"), "utf8"),
  );
  assert.equal(
    version.sha256,
    createHash("sha256").update(bytes).digest("hex"),
  );
  assert.ok(checksum.startsWith(version.sha256));
  const listing = (
    await exec("tar", ["-tzf", join(output, "musicq-server.tar.gz")])
  ).stdout
    .split("\n")
    .filter(Boolean);
  for (const file of [
    "packages/server/src/index.mjs",
    "packages/server/src/modern-model.py",
    "scripts/install-macos.sh",
    "scripts/uninstall-macos.sh",
    "packages/server/Dockerfile",
    "packages/web/package.json",
    "package-lock.json",
    "compose.yaml",
    ".env.example",
  ])
    assert.ok(listing.includes("musicq-server/" + file), file);
  assert.ok(
    !listing.some(
      (file) =>
        /(^|\/)(\.musicq|\.cache|node_modules|__pycache__|\.git)(\/|$)/.test(
          file,
        ) || /(^|\/)\.env$/.test(file),
    ),
  );

  let corrupt = false;
  const server = createServer((request, response) => {
    if (request.url.endsWith(".sha256"))
      response.end(
        corrupt ? "0".repeat(64) + "  musicq-server.tar.gz\n" : checksum,
      );
    else if (request.url === "/downloads/musicq-server.tar.gz")
      response.end(bytes);
    else {
      response.statusCode = 404;
      response.end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const script = join(root, "packages/web/public/install.sh");
  const destination = join(temporary, "unpacked");
  const valid = await runInstaller(script, destination, base);
  assert.equal(valid.code, 0, valid.output);
  await access(join(destination, "packages/server/src/index.mjs"));
  assert.equal(
    (await readFile(join(destination, "VERSION"), "utf8")).trim(),
    version.version,
  );
  const existing = await runInstaller(script, destination, base);
  assert.notEqual(existing.code, 0);
  assert.match(existing.output, /이미 존재/);
  corrupt = true;
  const invalid = await runInstaller(script, join(temporary, "invalid"), base);
  assert.notEqual(invalid.code, 0);
  assert.match(invalid.output, /검증에 실패/);
  await assert.rejects(access(join(temporary, "invalid")));
});
