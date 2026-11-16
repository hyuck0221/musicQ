import { test } from "node:test";
import assert from "node:assert/strict";
import { libraryQuerySchema, queryLibrary } from "../src/library-query.mjs";
const tracks = [
  {
    id: "a",
    title: "Rain desk",
    prompt: "warm piano",
    genre: "Lo-fi",
    category: "작업",
    mood: "차분한",
    modelId: "musicgen-small",
    instrumental: true,
    bpm: 80,
    duration: 17,
    createdAt: 1,
    scores: { energy: 25, warmth: 80 },
  },
  {
    id: "b",
    title: "Night walk",
    prompt: "synth bass",
    genre: "Electronic",
    category: "일상",
    mood: "어두운",
    modelId: "musicgen-medium",
    instrumental: false,
    bpm: 120,
    duration: 30,
    createdAt: 2,
    scores: { energy: 85, warmth: 20 },
  },
  {
    id: "c",
    title: "Rain morning",
    prompt: "warm guitar",
    genre: "Lo-fi",
    category: "작업",
    mood: "따뜻한",
    modelId: "musicgen-small",
    instrumental: true,
    bpm: 95,
    duration: 23,
    createdAt: 3,
    scores: { energy: 50, warmth: 70 },
  },
];
const query = (filters, other = {}) =>
  queryLibrary(
    tracks,
    libraryQuerySchema.parse({ filters: JSON.stringify(filters), ...other }),
  ).map((track) => track.id);
test("multiple filters intersect genre, scores and arbitrary durations on the server", () => {
  assert.deepEqual(
    query([
      { field: "genre", op: "eq", value: "Lo-fi" },
      { field: "duration", op: "between", value: 16, valueTo: 24 },
      { field: "warmth", op: "gte", value: 75 },
    ]),
    ["a"],
  );
});
test("repeated numeric fields narrow a range and reject contradictory conditions", () => {
  assert.deepEqual(
    query([
      { field: "bpm", op: "gte", value: 90 },
      { field: "bpm", op: "lte", value: 100 },
    ]),
    ["c"],
  );
  assert.deepEqual(
    query([
      { field: "bpm", op: "gte", value: 100 },
      { field: "bpm", op: "lte", value: 90 },
    ]),
    [],
  );
});
test("OR combines conditions while the search term still restricts the results", () => {
  assert.deepEqual(
    query(
      [
        { field: "mood", op: "eq", value: "차분한" },
        { field: "mood", op: "eq", value: "따뜻한" },
      ],
      { match: "any", search: "rain" },
    ),
    ["c", "a"],
  );
  assert.deepEqual(
    query([
      { field: "mood", op: "eq", value: "차분한" },
      { field: "mood", op: "eq", value: "따뜻한" },
    ]),
    [],
  );
});
test("model, vocal, negative text filters and sorting work together", () => {
  assert.deepEqual(
    query([
      { field: "modelId", op: "eq", value: "musicgen-small" },
      { field: "instrumental", op: "eq", value: true },
      { field: "prompt", op: "not_contains", value: "guitar" },
    ]),
    ["a"],
  );
  assert.deepEqual(query([], { match: "any", sort: "duration" }), [
    "b",
    "c",
    "a",
  ]);
  assert.deepEqual(query([], { genre: "Lo-fi", minEnergy: "40" }), ["c"]);
});
test("invalid operators, fields, ranges and oversized filter lists fail validation", () => {
  for (const filters of [
    [{ field: "filePath", op: "eq", value: "/tmp" }],
    [{ field: "bpm", op: "contains", value: 80 }],
    [{ field: "energy", op: "gte", value: 101 }],
    [{ field: "duration", op: "between", value: 30, valueTo: 20 }],
    [{ field: "duration", op: "between", value: 30 }],
    [{ field: "bpm", op: "eq", value: "80" }],
    Array.from({ length: 21 }, () => ({
      field: "genre",
      op: "eq",
      value: "Lo-fi",
    })),
  ])
    assert.throws(() =>
      libraryQuerySchema.parse({ filters: JSON.stringify(filters) }),
    );
  assert.throws(() => libraryQuerySchema.parse({ filters: "{" }));
});
