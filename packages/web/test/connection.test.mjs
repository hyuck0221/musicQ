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
      storage(JSON.stringify({ url: "http://localhost:4310", token: "key" })),
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
