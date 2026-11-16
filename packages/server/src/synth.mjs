// Explicit test engine: deterministic instrumental synthesis, no AI model.
import { readFile, writeFile } from "node:fs/promises";
const p = JSON.parse(await readFile(process.argv[2], "utf8"));
const rate = 22050,
  frames = rate * p.duration;
const buffer = Buffer.alloc(44 + frames * 2);
buffer.write("RIFF");
buffer.writeUInt32LE(buffer.length - 8, 4);
buffer.write("WAVEfmt ", 8);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20);
buffer.writeUInt16LE(1, 22);
buffer.writeUInt32LE(rate, 24);
buffer.writeUInt32LE(rate * 2, 28);
buffer.writeUInt16LE(2, 32);
buffer.writeUInt16LE(16, 34);
buffer.write("data", 36);
buffer.writeUInt32LE(frames * 2, 40);
const root = 130.81 * 2 ** ((p.seed % 12) / 12);
const beat = 60 / p.bpm;
const notes = [1, 1.2599, 1.4983, 1.8877, 2, 1.4983, 1.2599, 1.1225];
for (let i = 0; i < frames; i++) {
  const t = i / rate;
  const chord =
    [1, 1.2599, 1.4983].reduce(
      (s, n) => s + Math.sin(2 * Math.PI * root * n * t),
      0,
    ) / 3;
  const phase = t % beat;
  const melody =
    Math.sin(
      2 * Math.PI * root * 2 * notes[Math.floor(t / beat) % notes.length] * t,
    ) * Math.exp(-phase * 5);
  const kick =
    (Math.sin(2 * Math.PI * 55 * phase) *
      Math.exp(-phase * 24) *
      p.scores.energy) /
    100;
  const fade = Math.min(1, t / 0.5, (p.duration - t) / 1.5);
  buffer.writeInt16LE(
    Math.round((chord * 0.18 + melody * 0.16 + kick * 0.2) * fade * 32767),
    44 + i * 2,
  );
}
// Keep cancellation and live queue behavior observable even on fast computers.
await new Promise((resolve) =>
  setTimeout(resolve, Number(process.env.MUSICQ_DEMO_DELAY ?? 1800)),
);
await writeFile(p.output, buffer);
