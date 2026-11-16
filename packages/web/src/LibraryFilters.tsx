import { Plus, X } from "lucide-react";
import type { Model, Track } from "./types";

export type FilterRule = {
  id: string;
  field: string;
  op: string;
  value: string | number | boolean;
  valueTo?: number;
};
const choices = {
  genre: ["Lo-fi", "Ambient", "Jazz", "Electronic", "Acoustic", "Cinematic"],
  mood: ["차분한", "따뜻한", "몽환적인", "경쾌한", "어두운"],
  category: ["작업", "일상", "영상", "휴식", "운동"],
};
export const filterFields: Record<
  string,
  {
    label: string;
    min?: number;
    max?: number;
    initial: string | number | boolean;
    options?: string[];
  }
> = {
  genre: { label: "장르", initial: "Lo-fi", options: choices.genre },
  mood: { label: "느낌", initial: "차분한", options: choices.mood },
  category: { label: "용도", initial: "작업", options: choices.category },
  modelId: { label: "모델", initial: "demo" },
  bpm: { label: "템포 (BPM)", min: 40, max: 200, initial: 80 },
  duration: { label: "길이 (초)", min: 5, max: 300, initial: 30 },
  energy: { label: "에너지", min: 0, max: 100, initial: 50 },
  brightness: { label: "밝기", min: 0, max: 100, initial: 50 },
  warmth: { label: "온기", min: 0, max: 100, initial: 50 },
  danceability: { label: "리듬감", min: 0, max: 100, initial: 50 },
  complexity: { label: "복잡도", min: 0, max: 100, initial: 50 },
  instrumental: { label: "보컬", initial: true },
  title: { label: "이름", initial: "" },
  prompt: { label: "프롬프트", initial: "" },
};
export function createFilter(
  field: string,
  id: string = globalThis.crypto?.randomUUID?.() ??
    `filter-${Date.now()}-${Math.random().toString(36).slice(2)}`,
): FilterRule {
  const config = filterFields[field];
  return {
    id,
    field,
    op:
      config.min !== undefined
        ? "gte"
        : ["title", "prompt"].includes(field)
          ? "contains"
          : "eq",
    value: config.initial,
  };
}
export function validFilter(rule: FilterRule) {
  const config = filterFields[rule.field];
  if (!config) return false;
  if (config.min === undefined) return true;
  return (
    typeof rule.value === "number" &&
    Number.isFinite(rule.value) &&
    rule.value >= config.min &&
    rule.value <= config.max! &&
    (rule.op !== "between" ||
      (typeof rule.valueTo === "number" &&
        Number.isFinite(rule.valueTo) &&
        rule.valueTo >= rule.value &&
        rule.valueTo <= config.max!))
  );
}
export default function LibraryFilters({
  rules,
  match,
  models,
  tracks,
  onChange,
  onMatchChange,
}: {
  rules: FilterRule[];
  match: "all" | "any";
  models: Model[];
  tracks: Track[];
  onChange: (rules: FilterRule[]) => void;
  onMatchChange: (match: "all" | "any") => void;
}) {
  const add = () => {
    const field =
      Object.keys(filterFields).find(
        (key) => !rules.some((rule) => rule.field === key),
      ) ?? "genre";
    onChange([...rules, createFilter(field)]);
  };
  const change = (id: string, patch: Partial<FilterRule>) =>
    onChange(
      rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    );
  const modelIds = [
    ...new Set([
      ...models.map((model) => model.id),
      ...tracks.map((track) => track.modelId),
    ]),
  ];
  return (
    <div className="library-filters">
      <div className="filter-controls">
        <button
          className="secondary small"
          onClick={add}
          disabled={rules.length >= 20}
        >
          <Plus />
          필터 추가{" "}
          {rules.length > 0 && <span className="count">{rules.length}</span>}
        </button>
        {rules.length > 0 && (
          <>
            <select
              aria-label="필터 결합 방식"
              value={match}
              onChange={(event) =>
                onMatchChange(event.target.value as "all" | "any")
              }
            >
              <option value="all">모두 일치 (AND)</option>
              <option value="any">하나 이상 일치 (OR)</option>
            </select>
            <button className="text-button" onClick={() => onChange([])}>
              필터 초기화
            </button>
          </>
        )}
      </div>
      {rules.length > 0 && (
        <div className="filter-rules">
          {rules.map((rule, index) => {
            const config = filterFields[rule.field];
            const numeric = config.min !== undefined;
            const text = ["title", "prompt"].includes(rule.field);
            const operators = numeric
              ? [
                  ["gte", "이상"],
                  ["lte", "이하"],
                  ["eq", "같음"],
                  ["neq", "다름"],
                  ["between", "범위"],
                ]
              : text
                ? [
                    ["contains", "포함"],
                    ["not_contains", "미포함"],
                    ["eq", "같음"],
                    ["neq", "다름"],
                  ]
                : [
                    ["eq", "같음"],
                    ["neq", "다름"],
                  ];
            const prefix = `필터 ${index + 1}`;
            return (
              <div
                className={
                  "filter-rule " + (!validFilter(rule) ? "invalid" : "")
                }
                key={rule.id}
              >
                <select
                  aria-label={`${prefix} 항목`}
                  value={rule.field}
                  onChange={(event) =>
                    onChange(
                      rules.map((item) =>
                        item.id === rule.id
                          ? createFilter(event.target.value, rule.id)
                          : item,
                      ),
                    )
                  }
                >
                  {Object.entries(filterFields).map(([field, item]) => (
                    <option value={field} key={field}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`${prefix} 조건`}
                  value={rule.op}
                  onChange={(event) =>
                    change(rule.id, {
                      op: event.target.value,
                      ...(event.target.value === "between"
                        ? { valueTo: Math.max(Number(rule.value), config.max!) }
                        : {}),
                    })
                  }
                >
                  {operators.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <div className="filter-value">
                  {numeric ? (
                    <>
                      <input
                        aria-label={`${prefix} 값`}
                        type="number"
                        min={config.min}
                        max={config.max}
                        step={1}
                        value={String(rule.value)}
                        aria-invalid={!validFilter(rule)}
                        onChange={(event) =>
                          change(rule.id, {
                            value:
                              event.target.value === ""
                                ? ""
                                : Number(event.target.value),
                          })
                        }
                      />
                      {rule.op === "between" && (
                        <>
                          <span>–</span>
                          <input
                            aria-label={`${prefix} 최댓값`}
                            type="number"
                            min={config.min}
                            max={config.max}
                            step={1}
                            value={rule.valueTo ?? ""}
                            aria-invalid={!validFilter(rule)}
                            onChange={(event) =>
                              change(rule.id, {
                                valueTo:
                                  event.target.value === ""
                                    ? undefined
                                    : Number(event.target.value),
                              })
                            }
                          />
                        </>
                      )}
                    </>
                  ) : config.options ? (
                    <select
                      aria-label={`${prefix} 값`}
                      value={String(rule.value)}
                      onChange={(event) =>
                        change(rule.id, { value: event.target.value })
                      }
                    >
                      {config.options.map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  ) : rule.field === "modelId" ? (
                    <select
                      aria-label={`${prefix} 값`}
                      value={String(rule.value)}
                      onChange={(event) =>
                        change(rule.id, { value: event.target.value })
                      }
                    >
                      {modelIds.map((id) => (
                        <option key={id} value={id}>
                          {models.find((model) => model.id === id)?.name ?? id}
                        </option>
                      ))}
                    </select>
                  ) : rule.field === "instrumental" ? (
                    <select
                      aria-label={`${prefix} 값`}
                      value={String(rule.value)}
                      onChange={(event) =>
                        change(rule.id, {
                          value: event.target.value === "true",
                        })
                      }
                    >
                      <option value="true">보컬 없이</option>
                      <option value="false">보컬 허용</option>
                    </select>
                  ) : (
                    <input
                      aria-label={`${prefix} 값`}
                      value={String(rule.value)}
                      maxLength={200}
                      onChange={(event) =>
                        change(rule.id, { value: event.target.value })
                      }
                    />
                  )}
                </div>
                <button
                  className="icon-button"
                  aria-label={`${prefix} 삭제`}
                  onClick={() =>
                    onChange(rules.filter((item) => item.id !== rule.id))
                  }
                >
                  <X />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {rules.some((rule) => !validFilter(rule)) && (
        <div className="filter-error" role="alert">
          필터 값과 범위를 확인해 주세요
        </div>
      )}
    </div>
  );
}
