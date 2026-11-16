import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = process.env.MUSICQ_RELEASE_OUTPUT
  ? resolve(process.env.MUSICQ_RELEASE_OUTPUT)
  : join(root, "releases");
const temporary = await mkdtemp(join(tmpdir(), "musicq-release-"));
const bundle = join(temporary, "musicq-server");
const { version } = JSON.parse(
  await readFile(join(root, "packages/server/package.json"), "utf8"),
);
const filename = "musicq-server.tar.gz";

async function copyFile(path) {
  const destination = join(bundle, path);
  await mkdir(dirname(destination), { recursive: true });
  await cp(join(root, path), destination);
}
async function copySource(path) {
  for (const entry of await readdir(join(root, path), {
    withFileTypes: true,
  })) {
    if (entry.name.startsWith(".") || entry.name === "__pycache__") continue;
    const child = join(path, entry.name);
    if (entry.isDirectory()) await copySource(child);
    else if (
      entry.isFile() &&
      [".mjs", ".py", ".json"].includes(extname(entry.name))
    )
      await copyFile(child);
  }
}
try {
  await mkdir(bundle);
  // Explicit inputs: never copy runtime data, secrets, installed weights or caches.
  for (const path of [
    "package.json",
    "package-lock.json",
    "compose.yaml",
    ".env.example",
    ".dockerignore",
    "packages/server/package.json",
    "packages/server/Dockerfile",
    "packages/web/package.json",
    "scripts/copy-web.mjs",
    "scripts/install-macos.sh",
    "scripts/uninstall-macos.sh",
    "README.md",
    "docs/model-adapter.md",
    "docs/setup.md",
  ])
    await copyFile(path);
  await copySource("packages/server/src");
  // Packages run without a frontend toolchain; include the already-built panel.
  await readFile(join(root, "packages/server/web/index.html"));
  await cp(join(root, "packages/server/web"), join(bundle, "packages/server/web"), { recursive: true });
  await writeFile(join(bundle, "VERSION"), `${version}\n`);
  await writeFile(
    join(bundle, "INSTALL.md"),
    `# musicQ server ${version}\n\nmacOS: \`bash scripts/install-macos.sh\`\n\nDocker: \`docker compose up -d --build\`\n\nControl panel: http://127.0.0.1:4310\n\nSetup: docs/setup.md\n`,
  );
  await mkdir(output, { recursive: true });
  const archive = join(output, filename);
  const result = spawnSync(
    "tar",
    ["-czf", archive, "-C", temporary, "musicq-server"],
    {
      stdio: "inherit",
      env: { ...process.env, COPYFILE_DISABLE: "1" },
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`Server packaging failed (${result.status})`);
  const bytes = await readFile(archive);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await writeFile(`${archive}.sha256`, `${sha256}  ${filename}\n`);
  await writeFile(
    join(output, "version.json"),
    JSON.stringify({ version, filename, sha256 }, null, 2) + "\n",
  );
  console.log(
    `musicQ server ${version}: ${Math.ceil(bytes.length / 1024)} KB → ${archive}`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
