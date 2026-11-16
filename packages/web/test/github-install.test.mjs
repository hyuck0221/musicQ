import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "musicq-bootstrap-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const bin = join(dir, "bin"), temporary = join(dir, "temporary");
  const source = join(dir, "musicQ-master");
  await mkdir(bin); await mkdir(temporary); await mkdir(join(source, "scripts"), { recursive: true });
  await writeFile(join(source, "package.json"), '{}');
  await writeFile(join(source, "scripts/install-macos.sh"), '#!/bin/bash\nset -eu\ntest -f "$(dirname "$0")/../package.json"\nprintf "%s\\n" "$0" > "$MUSICQ_TEST_RESULT"\n');
  const scripts = {
    uname: 'echo Darwin',
    node: 'echo "${MUSICQ_TEST_NODE_MAJOR:-24}"',
    npm: 'exit 0',
    python3: 'exit 0',
    curl: 'if [ "${MUSICQ_TEST_DOWNLOAD_FAIL:-0}" = 1 ]; then exit 22; fi\nwhile [ "$#" -gt 0 ]; do\nif [ "$1" = --output ]; then cp "$MUSICQ_TEST_ARCHIVE" "$2"; exit 0; fi\nshift\ndone\nexit 1',
  };
  for (const [name, body] of Object.entries(scripts))
    await writeFile(join(bin, name), '#!/bin/sh\n' + body + '\n', { mode: 0o755 });
  const archive = join(dir, "source.tar.gz"), result = join(dir, "installed");
  await exec("tar", ["-czf", archive, "-C", dir, "musicQ-master"]);
  return { temporary, result, env: { ...process.env, PATH: bin + ':' + process.env.PATH,
    TMPDIR: temporary, MUSICQ_TEST_ARCHIVE: archive, MUSICQ_TEST_RESULT: result } };
}

test("GitHub bootstrap extracts sources, invokes the local installer and cleans temporary files", async (t) => {
  const f = await fixture(t);
  await exec("bash", [join(root, "install.sh")], { env: f.env });
  const invoked = (await readFile(f.result, "utf8")).trim();
  assert.ok(invoked.startsWith(f.temporary + '/'));
  assert.ok(invoked.endsWith('/source/scripts/install-macos.sh'));
  await assert.rejects(access(invoked));
  assert.deepEqual(await readdir(f.temporary), []);
});

test("GitHub bootstrap stops on failed download and cleans up without installing", async (t) => {
  const f = await fixture(t);
  await assert.rejects(exec("bash", [join(root, "install.sh")], {
    env: { ...f.env, MUSICQ_TEST_DOWNLOAD_FAIL: '1' },
  }));
  await assert.rejects(access(f.result));
  assert.deepEqual(await readdir(f.temporary), []);
});

test("GitHub bootstrap rejects unsupported Node before downloading or installing", async (t) => {
  const f = await fixture(t);
  await assert.rejects(exec("bash", [join(root, "install.sh")], {
    env: { ...f.env, MUSICQ_TEST_NODE_MAJOR: '22' },
  }), error => /Node.js 24/.test(error.stdout));
  await assert.rejects(access(f.result));
  assert.deepEqual(await readdir(f.temporary), []);
});
