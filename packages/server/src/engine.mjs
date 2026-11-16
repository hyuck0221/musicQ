import { spawn } from "node:child_process";
import { stripVTControlCharacters } from "node:util";
import { fileURLToPath } from "node:url";
import { writeFile, stat } from "node:fs/promises";

export async function generate(plan, output, signal, config) {
  const spec = `${output}.json`;
  await writeFile(spec, JSON.stringify({ ...plan, output }, null, 2));
  const command =
    config.engine === "demo"
      ? [
          process.execPath,
          fileURLToPath(new URL("./synth.mjs", import.meta.url)),
        ]
      : config.command;
  if (
    !Array.isArray(command) ||
    !command.length ||
    command.some((v) => typeof v !== "string")
  ) {
    throw new Error(
      "MUSICQ_MODEL_COMMAND에 실행 명령 JSON 배열을 설정해 주세요",
    );
  }
  signal.throwIfAborted();
  await new Promise((resolve, reject) => {
    const child = spawn(command[0], [...command.slice(1), spec], {
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, PYTHON_COLORS: "0", NO_COLOR: "1" },
      detached: process.platform !== "win32",
    });
    let stderr = "";
    let timedOut = false;
    let killTimer;
    const kill = () => {
      const send = (sig) => {
        try {
          process.platform === "win32"
            ? child.kill(sig)
            : process.kill(-child.pid, sig);
        } catch (e) {
          if (e.code !== "ESRCH") reject(e);
        }
      };
      send("SIGTERM");
      killTimer = setTimeout(() => send("SIGKILL"), 2000);
      killTimer.unref();
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      kill();
    }, config.timeout * 1000);
    signal.addEventListener("abort", kill, { once: true });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-2000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timeout);
      clearTimeout(killTimer);
      signal.removeEventListener("abort", kill);
      if (signal.aborted) reject(new Error("생성이 중단되었습니다"));
      else if (timedOut) reject(new Error("모델 실행 시간이 초과되었습니다"));
      else if (code !== 0)
        reject(
          new Error(
            `모델 실행 실패 (${code}): ${stripVTControlCharacters(stderr).trim()}`,
          ),
        );
      else resolve();
    });
  });
  signal.throwIfAborted();
  if ((await stat(output)).size < 44)
    throw new Error("모델이 유효한 WAV 파일을 만들지 않았습니다");
}
