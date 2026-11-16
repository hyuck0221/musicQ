import { z } from "zod";

const numberRule = (field, min, max) =>
  z
    .object({
      field: z.literal(field),
      op: z.enum(["eq", "neq", "gte", "lte", "between"]),
      value: z.number().finite().min(min).max(max),
      valueTo: z.number().finite().min(min).max(max).optional(),
    })
    .strict()
    .refine(
      (rule) =>
        rule.op !== "between" ||
        (rule.valueTo !== undefined && rule.valueTo >= rule.value),
      { message: "범위의 최댓값은 최솟값 이상이어야 합니다" },
    );
const textRule = (field) =>
  z
    .object({
      field: z.literal(field),
      op: z.enum(["eq", "neq", "contains", "not_contains"]),
      value: z.string().max(200),
    })
    .strict();
export const libraryFilterSchema = z
  .array(
    z.union([
      ...["title", "prompt", "genre", "mood", "category", "modelId"].map(
        textRule,
      ),
      numberRule("bpm", 40, 200),
      numberRule("duration", 5, 300),
      ...["energy", "brightness", "warmth", "danceability", "complexity"].map(
        (field) => numberRule(field, 0, 100),
      ),
      z
        .object({
          field: z.literal("instrumental"),
          op: z.enum(["eq", "neq"]),
          value: z.boolean(),
        })
        .strict(),
    ]),
  )
  .max(20);
const encodedFilters = z
  .string()
  .max(12000)
  .default("[]")
  .transform((raw, ctx) => {
    try {
      return JSON.parse(raw);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "검색 필터 형식이 잘못되었습니다",
      });
      return z.NEVER;
    }
  })
  .pipe(libraryFilterSchema);
export const libraryQuerySchema = z.object({
  search: z.string().max(200).default(""),
  // Retain simple query parameters for existing API clients.
  genre: z.string().default(""),
  category: z.string().default(""),
  mood: z.string().default(""),
  minEnergy: z.coerce.number().min(0).max(100).default(0),
  sort: z
    .enum([
      "newest",
      "oldest",
      "title",
      "bpm",
      "duration",
      "energy",
      "brightness",
      "warmth",
      "danceability",
      "complexity",
    ])
    .default("newest"),
  filters: encodedFilters,
  match: z.enum(["all", "any"]).default("all"),
});

export function matchesFilter(track, rule) {
  const actual = track.scores?.[rule.field] ?? track[rule.field];
  if (typeof rule.value === "number") {
    if (typeof actual !== "number" || !Number.isFinite(actual)) return false;
    switch (rule.op) {
      case "eq":
        return actual === rule.value;
      case "neq":
        return actual !== rule.value;
      case "gte":
        return actual >= rule.value;
      case "lte":
        return actual <= rule.value;
      case "between":
        return actual >= rule.value && actual <= rule.valueTo;
    }
  }
  if (typeof rule.value === "boolean")
    return rule.op === "eq" ? actual === rule.value : actual !== rule.value;
  const text = String(actual ?? "").toLocaleLowerCase();
  const expected = rule.value.toLocaleLowerCase();
  switch (rule.op) {
    case "eq":
      return text === expected;
    case "neq":
      return text !== expected;
    case "contains":
      return text.includes(expected);
    case "not_contains":
      return !text.includes(expected);
  }
  return false;
}
export function queryLibrary(tracks, q) {
  return tracks
    .filter((track) => {
      const searchable =
        `${track.title} ${track.prompt} ${track.genre} ${track.mood} ${track.category}`.toLocaleLowerCase();
      if (
        !searchable.includes(q.search.toLocaleLowerCase()) ||
        (q.genre && track.genre !== q.genre) ||
        (q.category && track.category !== q.category) ||
        (q.mood && track.mood !== q.mood) ||
        track.scores.energy < q.minEnergy
      )
        return false;
      return (
        !q.filters.length ||
        (q.match === "all"
          ? q.filters.every((rule) => matchesFilter(track, rule))
          : q.filters.some((rule) => matchesFilter(track, rule)))
      );
    })
    .sort((a, b) =>
      q.sort === "title"
        ? a.title.localeCompare(b.title, "ko")
        : q.sort === "oldest"
          ? a.createdAt - b.createdAt
          : q.sort === "newest"
            ? b.createdAt - a.createdAt
            : (b.scores[q.sort] ?? b[q.sort]) - (a.scores[q.sort] ?? a[q.sort]),
    );
}
