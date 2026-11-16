import { libraryQuerySchema, queryLibrary } from "./library-query.mjs";
import Fastify from "fastify";
import staticFiles from "@fastify/static";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import websocket from "@fastify/websocket";
import { z } from "zod";
import { createReadStream, statSync, existsSync } from "node:fs";
import { MusicService } from "./service.mjs";

export async function createApp(config) {
  const app = Fastify({ logger: config.logger ?? false, bodyLimit: 32768 });
  const service = new MusicService(config);
  app.decorate("music", service);
  const sockets = new Set();
  const snapshot = () => ({
    ...service.snapshot(),
    tracks: service.tracks.map((track) => ({
      ...track,
      mediaPath: `/api/audio/${track.id}`,
    })),
  });
  await app.register(websocket, { options: { maxPayload: 4096 } });
  // No credentials: only the origin serving this control panel may use the API.
  app.addHook("onRequest", async (req, reply) => {
    if (!/^\/(api|ws)(\/|\?|$)/.test(req.url)) return;
    const origin = req.headers.origin;
    const sameOrigin = `${req.protocol}://${req.host}`;
    if (origin && origin !== sameOrigin)
      return reply.code(403).send({ error: "같은 서버의 화면에서 요청해 주세요" });
    if (req.headers["sec-fetch-site"] === "cross-site")
      return reply.code(403).send({ error: "다른 사이트의 요청은 허용하지 않습니다" });
  });
  app.setErrorHandler((error, req, reply) => {
    const message =
      error instanceof z.ZodError
        ? error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join(", ")
        : error.message;
    reply
      .code(error.statusCode && error.statusCode < 500 ? error.statusCode : 400)
      .send({ error: message });
  });
  app.get("/health", () => ({ name: "musicQ", version: "0.1.0" }));
  app.get("/api/state", snapshot);
  app.post("/api/queue", (req) => service.enqueue(req.body));
  app.patch("/api/queue", (req) => {
    service.setPaused(z.object({ paused: z.boolean() }).parse(req.body).paused);
    return { ok: true };
  });
  app.post("/api/queue/reorder", (req) => {
    service.reorder(
      z.object({ ids: z.array(z.string().uuid()).max(1000) }).parse(req.body)
        .ids,
    );
    return { ok: true };
  });
  app.post("/api/queue/:id/cancel", (req) => {
    service.cancel(req.params.id);
    return { ok: true };
  });
  app.delete("/api/queue/:id", (req) => {
    service.removeJob(req.params.id);
    return { ok: true };
  });
  app.post("/api/queue/:id/retry", (req) => {
    const job = service.jobs.find((j) => j.id === req.params.id);
    if (!job) throw new Error("작업을 찾을 수 없습니다");
    return service.enqueue(job.request, job.parentId);
  });
  app.get("/api/library", (req) =>
    queryLibrary(snapshot().tracks, libraryQuerySchema.parse(req.query)),
  );
  app.delete("/api/library/:id", (req) => {
    service.removeTrack(req.params.id);
    return { ok: true };
  });
  app.post("/api/library/:id/regenerate", (req) =>
    service.regenerate(req.params.id),
  );
  app.patch("/api/player", (req) =>
    service.updatePlayer(
      z
        .object({
          trackId: z.string().uuid().optional(),
          playing: z.boolean().optional(),
          position: z.number().min(0).max(300).optional(),
          target: z.enum(["browser", "server"]).optional(),
          volume: z.number().min(0).max(1).optional(),
        })
        .parse(req.body),
    ),
  );
  app.post("/api/models/:id/install", (req) => {
    service.models.install(req.params.id);
    return { ok: true };
  });
  app.post("/api/models/:id/cancel", (req) => {
    service.models.cancel(req.params.id);
    return { ok: true };
  });
  app.delete("/api/models/:id", (req) => {
    if (
      service.jobs.some(
        (j) =>
          j.request.modelId === req.params.id &&
          ["queued", "planning", "running"].includes(j.status),
      )
    )
      throw new Error("이 모델을 사용하는 큐를 먼저 중단하거나 삭제해 주세요");
    service.models.remove(req.params.id);
    return { ok: true };
  });
  app.get("/api/audio/:id", (req, reply) => {
    const path = service.audioPath(req.params.id),
      size = statSync(path).size;
    reply
      .header("Content-Type", "audio/wav")
      .header("Accept-Ranges", "bytes")
      .header("Cache-Control", "private, no-store")
      .header("Referrer-Policy", "no-referrer");
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2]))
        return reply
          .code(416)
          .header("Content-Range", `bytes */${size}`)
          .send();
      const start = match[1]
        ? Number(match[1])
        : Math.max(0, size - Number(match[2]));
      const end = match[1]
        ? match[2]
          ? Math.min(Number(match[2]), size - 1)
          : size - 1
        : size - 1;
      if (start >= size || start > end)
        return reply
          .code(416)
          .header("Content-Range", `bytes */${size}`)
          .send();
      return reply
        .code(206)
        .header("Content-Range", `bytes ${start}-${end}/${size}`)
        .header("Content-Length", end - start + 1)
        .send(createReadStream(path, { start, end }));
    }
    return reply.header("Content-Length", size).send(createReadStream(path));
  });
  app.get("/ws", { websocket: true }, (socket) => {
    let alive = true;
    sockets.add(socket);
    socket.send(JSON.stringify(snapshot()));
    const heartbeat = setInterval(() => {
      if (!alive) return socket.terminate();
      alive = false;
      socket.ping();
    }, 30000);
    socket.on("pong", () => {
      alive = true;
    });
    socket.on("close", () => {
      clearInterval(heartbeat);
      sockets.delete(socket);
    });
    socket.on("error", () => socket.close());
  });
  const broadcast = () => {
    const data = JSON.stringify(snapshot());
    for (const socket of sockets) {
      if (socket.bufferedAmount > 1024 * 1024) socket.terminate();
      else if (socket.readyState === 1) socket.send(data);
    }
  };
  service.on("change", broadcast);
  app.addHook("onClose", async () => {
    service.off("change", broadcast);
    for (const s of sockets) s.close();
    await service.close();
  });
  const webRoot = config.webRoot ?? fileURLToPath(new URL("../web/", import.meta.url));
  if (existsSync(join(webRoot, "index.html"))) {
    await app.register(staticFiles, {
      root: webRoot,
      index: "index.html",
      dotfiles: "ignore",
      setHeaders(reply, path) {
        reply.header("Cache-Control", path.endsWith(".html")
          ? "no-cache" : path.includes("/assets/")
            ? "public, max-age=31536000, immutable" : "no-cache");
      },
    });
    app.setNotFoundHandler((req, reply) => {
      const path = req.url.split("?")[0];
      if (["GET", "HEAD"].includes(req.method) &&
          !/^\/(api|ws|health|assets)(\/|$)/.test(path) &&
          !path.split("/").pop().includes("."))
        return reply.header("Cache-Control", "no-cache").sendFile("index.html");
      return reply.code(404).send({ error: "찾을 수 없습니다" });
    });
  } else {
    app.get("/", (_req, reply) => reply.code(503).type("text/plain; charset=utf-8")
      .send("화면을 먼저 빌드해 주세요: npm run build"));
  }
  return app;
}
