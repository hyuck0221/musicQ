import { resolve, join } from "node:path";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { createApp } from "./app.mjs";
const dir = resolve(process.env.MUSICQ_DATA_DIR || "../../.musicq");
mkdirSync(dir, { recursive: true, mode: 0o700 });
const tokenFile = join(dir, "token");
const token =
  process.env.MUSICQ_TOKEN ||
  (existsSync(tokenFile)
    ? readFileSync(tokenFile, "utf8").trim()
    : randomBytes(24).toString("hex"));
if (!existsSync(tokenFile)) writeFileSync(tokenFile, token, { mode: 0o600 });
chmodSync(tokenFile, 0o600);
const config = {
  dir,
  token,
  timeout: Number(process.env.MUSICQ_MODEL_TIMEOUT || 1800),
  command: process.env.MUSICQ_MODEL_COMMAND
    ? JSON.parse(process.env.MUSICQ_MODEL_COMMAND)
    : null,
  origins: (
    process.env.MUSICQ_ORIGINS ||
    "https://musicq.hshim.dev,http://localhost:5173,http://127.0.0.1:5173"
  )
    .split(",")
    .map((s) => s.trim()),
};
const app = await createApp(config);
const address = await app.listen({
  host: process.env.MUSICQ_HOST || "127.0.0.1",
  port: Number(process.env.MUSICQ_PORT || 4310),
});
console.log(
  `\nmusicQ server · ${address}\n연결 키: ${token}\n저장 위치: ${dir}\n`,
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
