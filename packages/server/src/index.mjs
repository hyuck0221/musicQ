import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { createApp } from "./app.mjs";
const dir = resolve(process.env.MUSICQ_DATA_DIR || "../../.musicq");
mkdirSync(dir, { recursive: true, mode: 0o700 });
const app = await createApp({
  dir,
  timeout: Number(process.env.MUSICQ_MODEL_TIMEOUT || 1800),
  command: process.env.MUSICQ_MODEL_COMMAND
    ? JSON.parse(process.env.MUSICQ_MODEL_COMMAND)
    : null,
});
const address = await app.listen({
  host: process.env.MUSICQ_HOST || "127.0.0.1",
  port: Number(process.env.MUSICQ_PORT || 4310),
});
console.log(`\nmusicQ · ${address}\n브라우저에서 위 주소를 여세요\n저장 위치: ${dir}\n`);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
