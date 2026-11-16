import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeConnection, readSavedConnection } from "../src/connection.ts";

const storage = (value) => ({
  getItem: (key) => {
    assert.equal(key, "musicq.connection");
    return value;
  },
});
test("saved credentials restore a normalized session without a connection prompt", () => {
  assert.deepEqual(
    readSavedConnection(
      storage(
        JSON.stringify({
          url: "http://127.0.0.1:4310/",
          token: " remembered-key ",
        }),
      ),
      "http:",
    ),
    { url: "http://127.0.0.1:4310", token: "remembered-key" },
  );
});
test("missing, malformed, or incomplete saved credentials require manual connection", () => {
  for (const value of [
    null,
    "{bad-json",
    "null",
    "false",
    "[]",
    "{}",
    JSON.stringify({ url: "http://localhost:4310", token: "" }),
    JSON.stringify({ url: 1, token: "key" }),
  ]) {
    assert.equal(readSavedConnection(storage(value), "http:"), null);
  }
  assert.equal(
    readSavedConnection(
      {
        getItem: () => {
          throw new Error("storage denied");
        },
      },
      "http:",
    ),
    null,
  );
});
test("stored credentials cannot bypass URL and mixed-content validation", () => {
  for (const url of [
    "javascript:alert(1)",
    "https://name:password@example.com",
    "https://example.com/api",
    "https://example.com?token=secret",
    "https://example.com/#token",
  ]) {
    assert.throws(() => normalizeConnection({ url, token: "key" }, "https:"));
  }
  assert.equal(
    readSavedConnection(
      storage(
        JSON.stringify({ url: "http://public.example.com:4310", token: "key" }),
      ),
      "https:",
    ),
    null,
  );
  assert.deepEqual(
    normalizeConnection(
      { url: "https://music.example.com", token: "key" },
      "https:",
    ),
    { url: "https://music.example.com", token: "key" },
  );
});

test("HTTPS panel accepts local HTTP endpoints and restores their saved credentials", () => {
  for (const url of [
    "http://localhost:4310",
    "http://studio.localhost:4310",
    "http://localhost.:4310",
    "http://127.0.0.1:4310",
    "http://127.2.3.4:4310",
    "http://10.0.0.4:4310",
    "http://172.16.0.1:4310",
    "http://172.31.255.254:4310",
    "http://192.168.1.10:4310",
    "http://169.254.2.3:4310",
    "http://music-server.local:4310",
    "http://[::1]:4310",
    "http://[fd00::1234]:4310",
    "http://[fe80::1234]:4310",
  ]) {
    const connection = normalizeConnection({ url, token: "key" }, "https:");
    assert.equal(connection.token, "key");
    assert.deepEqual(
      readSavedConnection(storage(JSON.stringify(connection)), "https:"),
      connection,
    );
  }
});
test("HTTPS panel still rejects public HTTP and misleading local-looking names", () => {
  for (const url of [
    "http://example.com",
    "http://8.8.8.8:4310",
    "http://172.15.255.255",
    "http://172.32.0.1",
    "http://192.169.0.1",
    "http://192.168.1.2.example.com",
    "http://localhost.example.com",
    "http://server.local.example.com",
    "http://[2001:4860:4860::8888]:4310",
  ]) {
    assert.throws(
      () => normalizeConnection({ url, token: "key" }, "https:"),
      /HTTPS/,
    );
  }
});
