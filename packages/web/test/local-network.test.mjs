import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authorizeServer,
  needsLocalMediaBridge,
  queryServerPermission,
  serverAddressSpace,
  serverRequestOptions,
} from "../src/localNetwork.ts";
import { loadMediaSource } from "../src/mediaSource.ts";

test("address classification distinguishes loopback, LAN and public addresses", () => {
  for (const host of [
    "localhost",
    "studio.localhost",
    "127.0.0.1",
    "127.3.4.5",
    "[::1]",
  ])
    assert.equal(serverAddressSpace(`http://${host}:4310`), "loopback");
  for (const host of [
    "192.168.1.5",
    "10.1.2.3",
    "172.16.2.3",
    "172.31.2.3",
    "169.254.2.3",
    "studio.local",
    "[fc00::1]",
    "[fdff::1]",
    "[fe80::1]",
    "[febf::1]",
  ])
    assert.equal(serverAddressSpace(`http://${host}:4310`), "local");
  for (const host of [
    "8.8.8.8",
    "172.15.1.1",
    "172.32.1.1",
    "[fec0::1]",
    "[2001:db8::1]",
    "localhost.example.org",
    "device.local.example.org",
  ])
    assert.equal(serverAddressSpace(`http://${host}:4310`), null);
});
test("API options declare the target space without dropping authorization or mutation parameters", () => {
  const result = serverRequestOptions("http://192.168.0.10:4310", {
    method: "POST",
    headers: { Authorization: "Bearer test" },
    body: "{}",
  });
  assert.equal(result.targetAddressSpace, "local");
  assert.equal(result.mode, "cors");
  assert.equal(result.redirect, "error");
  assert.equal(result.method, "POST");
  assert.equal(result.headers.Authorization, "Bearer test");
  assert.equal(result.body, "{}");
  assert.equal(
    serverRequestOptions("http://localhost:4310").targetAddressSpace,
    "loopback",
  );
  assert.equal(
    serverRequestOptions("https://music.example.com").targetAddressSpace,
    undefined,
  );
});
test("saved connections query granular permissions; unknown names require an explicit click", async () => {
  const names = [];
  const permissions = {
    query: async (descriptor) => {
      names.push(descriptor.name);
      return { state: "granted" };
    },
  };
  assert.equal(
    await queryServerPermission("http://localhost:4310", "https:", permissions),
    "granted",
  );
  assert.equal(
    await queryServerPermission(
      "http://192.168.1.10:4310",
      "https:",
      permissions,
    ),
    "granted",
  );
  assert.deepEqual(names, ["loopback-network", "local-network"]);
  assert.equal(
    await queryServerPermission("http://localhost:4310", "https:", {
      query: async () => {
        throw new TypeError("unsupported");
      },
    }),
    "prompt",
  );
  assert.equal(
    await queryServerPermission("http://localhost:4310", "https:"),
    "prompt",
  );
  assert.equal(
    await queryServerPermission("http://localhost:4310", "http:"),
    "granted",
  );
});
test("explicit connection requests permission through a credential-free health probe", async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return Response.json({ name: "musicQ" });
  };
  await authorizeServer(
    "http://localhost:4310",
    "https:",
    new AbortController().signal,
    { query: async () => ({ state: "prompt" }) },
    fetcher,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://localhost:4310/health");
  assert.equal(calls[0].options.targetAddressSpace, "loopback");
  assert.equal(calls[0].options.headers, undefined);
  await authorizeServer(
    "https://example.com",
    "https:",
    new AbortController().signal,
    undefined,
    fetcher,
  );
  assert.equal(calls.length, 1);
});
test("denied permissions and wrong health endpoints do not silently open a session", async () => {
  const fetcher = async () => {
    throw new Error("must not fetch");
  };
  await assert.rejects(
    authorizeServer(
      "http://localhost:4310",
      "https:",
      new AbortController().signal,
      { query: async () => ({ state: "denied" }) },
      fetcher,
    ),
    /사이트 설정/,
  );
  await assert.rejects(
    authorizeServer(
      "http://localhost:4310",
      "https:",
      new AbortController().signal,
      undefined,
      async () => Response.json({ name: "other" }),
    ),
    /musicQ 서버 주소/,
  );
});
test("local HTTP audio uses a permission-aware fetch and releases its blob URL", async (t) => {
  const calls = [];
  const created = t.mock.method(URL, "createObjectURL", (blob) => {
    assert.equal(blob.type, "audio/wav");
    return "blob:test-local-music";
  });
  const revoked = t.mock.method(URL, "revokeObjectURL", () => {});
  const media = await loadMediaSource(
    "http://192.168.1.10:4310/api/audio/track?signature=test",
    "https:",
    new AbortController().signal,
    async (url, options) => {
      calls.push({ url, options });
      return new Response(new Blob(["RIFFaudio"], { type: "audio/wav" }));
    },
  );
  assert.equal(media.src, "blob:test-local-music");
  assert.equal(created.mock.callCount(), 1);
  assert.equal(calls[0].options.targetAddressSpace, "local");
  media.release();
  assert.equal(revoked.mock.calls[0].arguments[0], media.src);
});
test("HTTPS audio remains a direct stream, and aborted downloads do not leak blob URLs", async (t) => {
  const direct = await loadMediaSource(
    "https://server.example.com/api/audio/1",
    "https:",
    new AbortController().signal,
    async () => {
      throw new Error("must not buffer HTTPS");
    },
  );
  assert.equal(direct.src, "https://server.example.com/api/audio/1");
  direct.release();
  assert.equal(
    needsLocalMediaBridge("http://localhost:4310/audio", "http:"),
    false,
  );
  const created = t.mock.method(
    URL,
    "createObjectURL",
    () => "blob:unexpected",
  );
  const controller = new AbortController();
  await assert.rejects(
    loadMediaSource(
      "http://localhost:4310/audio",
      "https:",
      controller.signal,
      async () => ({
        ok: true,
        blob: async () => {
          controller.abort();
          return new Blob(["audio"]);
        },
      }),
    ),
    { name: "AbortError" },
  );
  assert.equal(created.mock.callCount(), 0);
});
