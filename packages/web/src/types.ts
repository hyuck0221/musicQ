export const scoreLabels = {
  energy: "에너지",
  brightness: "밝기",
  warmth: "온기",
  danceability: "리듬감",
  complexity: "복잡도",
};
export type Scores = Record<keyof typeof scoreLabels, number>;
export type Draft = {
  title: string;
  mode: "guided" | "prompt";
  prompt: string;
  category: string;
  genre: string;
  mood: string;
  duration: number;
  bpm: number;
  instrumental: boolean;
  modelId: string;
  scores: Partial<Scores>;
};
export type Plan = Draft & {
  seed: number;
  scores: Scores;
  resolvedPrompt: string;
};
export type Job = {
  id: string;
  request: Draft;
  plan: Plan | null;
  status:
    | "queued"
    | "planning"
    | "running"
    | "completed"
    | "failed"
    | "cancelled";
  createdAt: number;
  startedAt?: number;
  error: string | null;
};
export type Track = Plan & {
  id: string;
  createdAt: number;
  mediaPath: string;
  parentId: string | null;
};
export type Model = {
  id: string;
  name: string;
  status: "installed" | "available" | "installing" | "failed";
  size: string;
  description: string;
  maxDuration: number;
  minDuration?: number;
  parameters?: string;
  hardware?: string;
  license?: string;
  access?: string;
  repo?: string;
  phase?: string;
  error?: string;
};
export type Player = {
  trackId: string | null;
  playing: boolean;
  position: number;
  updatedAt: number;
  volume: number;
  target: "browser" | "server";
  error?: string;
};
export type State = {
  jobs: Job[];
  tracks: Track[];
  models: Model[];
  paused: boolean;
  player: Player;
  serverTime: number;
};
export type Connection = { url: string; token: string };
export const initialDraft: Draft = {
  title: "",
  mode: "guided",
  prompt: "",
  category: "작업",
  genre: "Lo-fi",
  mood: "차분한",
  duration: 30,
  bpm: 80,
  instrumental: true,
  modelId: "demo",
  scores: {},
};
export const emptyState: State = {
  jobs: [],
  tracks: [],
  models: [],
  paused: false,
  serverTime: Date.now(),
  player: {
    trackId: null,
    playing: false,
    position: 0,
    updatedAt: 0,
    volume: 0.8,
    target: "browser",
  },
};
export function stored<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export function persist(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Private mode can disable local storage. Session remains usable. */
  }
}
export const time = (s: number) =>
  `${Math.floor(s / 60)}:${Math.floor(s % 60)
    .toString()
    .padStart(2, "0")}`;
