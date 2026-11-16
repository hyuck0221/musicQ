import { z } from "zod";

export const dimensions = [
  "energy",
  "brightness",
  "warmth",
  "danceability",
  "complexity",
];
export const requestSchema = z
  .object({
    modelId: z.string().min(1).max(80).default("demo"),
    title: z.string().trim().max(100).default(""),
    mode: z.enum(["guided", "prompt"]).default("guided"),
    prompt: z.string().trim().max(3000).default(""),
    category: z.enum(["일상", "작업", "영상", "휴식", "운동"]).default("작업"),
    genre: z
      .enum(["Lo-fi", "Ambient", "Jazz", "Electronic", "Acoustic", "Cinematic"])
      .default("Lo-fi"),
    mood: z
      .enum(["차분한", "따뜻한", "몽환적인", "경쾌한", "어두운"])
      .default("차분한"),
    duration: z.number().int().min(5).max(300).default(30),
    bpm: z.number().int().min(40).max(200).default(80),
    instrumental: z.boolean().default(true),
    seed: z.number().int().min(0).max(2147483647).optional(),
    scores: z
      .object(
        Object.fromEntries(
          dimensions.map((k) => [
            k,
            z.number().int().min(0).max(100).optional(),
          ]),
        ),
      )
      .default({}),
  })
  .refine((v) => v.mode !== "prompt" || v.prompt.length > 0, {
    message: "프롬프트를 입력해 주세요",
    path: ["prompt"],
  });

// Intent descriptors, not measured audio features. Computed and persisted before inference.
export function planMusic(input, seed) {
  const scores = {
    energy: 40,
    brightness: 45,
    warmth: 65,
    danceability: 40,
    complexity: 40,
  };
  const genre = {
    "Lo-fi": [30, 35, 80, 45, 35],
    Ambient: [15, 40, 55, 10, 30],
    Jazz: [45, 55, 75, 50, 80],
    Electronic: [75, 65, 30, 85, 65],
    Acoustic: [35, 60, 85, 30, 45],
    Cinematic: [65, 45, 50, 20, 85],
  };
  dimensions.forEach((k, i) => {
    scores[k] = genre[input.genre][i];
  });
  const text = `${input.mood} ${input.prompt}`.toLowerCase();
  const rules = [
    [/차분|calm|relax|편안|휴식/, { energy: -15, danceability: -10 }],
    [/따뜻|warm|포근/, { warmth: 15, brightness: 10 }],
    [
      /경쾌|upbeat|energetic|신나|운동/,
      { energy: 20, danceability: 15, brightness: 15 },
    ],
    [/어두|dark|슬픈|sad/, { brightness: -25, warmth: -10 }],
    [/몽환|dream|공간|space/, { complexity: 10, energy: -10 }],
  ];
  for (const [pattern, delta] of rules)
    if (pattern.test(text)) {
      for (const [k, value] of Object.entries(delta)) scores[k] += value;
    }
  for (const k of dimensions)
    scores[k] = input.scores[k] ?? Math.max(0, Math.min(100, scores[k]));
  const moodEn = {
    차분한: "calm and relaxed",
    따뜻한: "warm and cozy",
    몽환적인: "dreamy and atmospheric",
    경쾌한: "upbeat and lively",
    어두운: "dark and melancholic",
  };
  const useEn = {
    작업: "background music for focus",
    일상: "everyday listening",
    영상: "soundtrack for video",
    휴식: "rest and relaxation",
    운동: "workout music",
  };
  const prompt = [
    input.prompt,
    `${input.genre}, ${moodEn[input.mood]}, ${useEn[input.category]}`,
    `${input.bpm} BPM, ${input.duration} seconds`,
    input.instrumental ? "instrumental, no vocals" : "vocals allowed",
    dimensions.map((k) => `${k}: ${scores[k]}/100`).join(", "),
  ]
    .filter(Boolean)
    .join(". ");
  return {
    ...input,
    seed,
    scores,
    title: input.title || `${input.mood} ${input.genre}`,
    resolvedPrompt: prompt,
    planner: "intent-rules-v1",
  };
}
