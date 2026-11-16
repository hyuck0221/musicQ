import { libraryQuerySchema, queryLibrary } from "./library-query.mjs";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { z } from "zod";
import { timingSafeEqual, createHmac } from "node:crypto";
import { createReadStream, statSync } from "node:fs";
import { MusicService } from "./service.mjs";

const safeEqual = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
export async function createApp(config) {
  const app = Fastify({ logger: config.logger ?? false, bodyLimit: 32768 });
  const service = new MusicService(config);
  app.decorate("music", service);
  const sockets = new Set();
  const sign = (id, expires) =>
    createHmac("sha256", config.token).update(`${id}:${expires}`).digest("hex");
  const snapshot = () => {
    const state = service.snapshot();
    const expires = Math.floor(Date.now() / 86400000) * 86400 + 172800;
    return {
      ...state,
      tracks: state.tracks.map((t) => ({
        ...t,
        mediaPath: `/api/audio/${t.id}?expires=${expires}&signature=${sign(t.id, expires)}`,
      })),
    };
  };
  await app.register(cors, {
    origin: config.origins,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
  });
  await app.register(websocket, { options: { maxPayload: 4096 } });
  app.addHook("onRequest", async (req, reply) => {
    if (req.headers.origin && !config.origins.includes(req.headers.origin))
      return reply.code(403).send({
        error: "허용되지 않은 웹 주소입니다. MUSICQ_ORIGINS를 확인해 주세요",
      });
    if (
      req.method === "OPTIONS" ||
      req.url === "/health" ||
      req.url.startsWith("/ws") ||
      req.url.startsWith("/api/audio/")
    )
      return;
    if (!safeEqual(req.headers.authorization, `Bearer ${config.token}`))
      return reply.code(401).send({ error: "연결 키가 일치하지 않습니다" });
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
    const { expires, signature } = req.query;
    if (
      !/^\d{10}$/.test(expires ?? "") ||
      Number(expires) < Date.now() / 1000 ||
      !safeEqual(signature, sign(req.params.id, expires))
    )
      return reply
        .code(401)
        .send({ error: "미디어 주소가 만료되었습니다. 다시 연결해 주세요" });
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
    let authenticated = false;
    let alive = true;
    const authTimeout = setTimeout(
      () => socket.close(4001, "Authentication required"),
      5000,
    );
    const heartbeat = setInterval(() => {
      if (!alive) return socket.terminate();
      alive = false;
      socket.ping();
    }, 30000);
    socket.on("pong", () => {
      alive = true;
    });
    socket.on("message", (data) => {
      try {
        if (authenticated) return;
        const input = JSON.parse(data.toString());
        if (!safeEqual(input.token, config.token))
          return socket.close(4001, "Invalid token");
        authenticated = true;
        clearTimeout(authTimeout);
        sockets.add(socket);
        socket.send(JSON.stringify(snapshot()));
      } catch {
        socket.close(4000, "Invalid message");
      }
    });
    socket.on("close", () => {
      clearTimeout(authTimeout);
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
  return app;
}
