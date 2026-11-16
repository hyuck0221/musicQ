import LibraryFilters, { validFilter } from "./LibraryFilters";
import type { FilterRule } from "./LibraryFilters";
import TrackList from "./TrackList";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  AudioLines,
  Check,
  ChevronRight,
  Download,
  HardDrive,
  Headphones,
  ListMusic,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Square,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { useStudio } from "./useStudio";
import { initialDraft, persist, scoreLabels, stored, time } from "./types";
import type { Draft, Job, Model, Scores, Track } from "./types";

type View = "studio" | "library" | "models";
const genres = [
  "Lo-fi",
  "Ambient",
  "Jazz",
  "Electronic",
  "Acoustic",
  "Cinematic",
];
const moods = ["차분한", "따뜻한", "몽환적인", "경쾌한", "어두운"];
const categories = ["작업", "일상", "영상", "휴식", "운동"];
const labels = {
  queued: "대기",
  planning: "속성 설정",
  running: "생성 중",
  completed: "완료",
  failed: "실패",
  cancelled: "중단",
};
export default function App() {
  const studio = useStudio();
  const { state, status, api, clockOffset } = studio;
  const online = status === "online";
  const [view, setView] = useState<View>("studio");
  const [draft, setDraft] = useState<Draft>(() => ({
    ...initialDraft,
    ...stored<Partial<Draft>>("musicq.draft", {}),
  }));
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<Track | null>(null);
  const [confirm, setConfirm] = useState<{
    text: string;
    action: () => Promise<unknown>;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [filterMatch, setFilterMatch] = useState<"all" | "any">("all");
  const [sort, setSort] = useState("newest");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [now, setNow] = useState(Date.now());
  const audio = useRef<HTMLAudioElement>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [audioReload, setAudioReload] = useState(0);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const selectedTrack = state.tracks.find((t) => t.id === state.player.trackId);
  const installed = state.models.filter((m) => m.status === "installed");
  const activeJobs = state.jobs.filter((j) =>
    ["queued", "planning", "running"].includes(j.status),
  );
  const recentJobs = state.jobs
    .filter((j) => j.status === "failed" || j.status === "cancelled")
    .slice(-3);
  useEffect(() => {
    persist("musicq.draft", draft);
  }, [draft]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(t);
  }, [notice]);
  const selectedModel = state.models.find(
    (model) => model.id === draft.modelId,
  );
  const durationMin = selectedModel?.minDuration ?? 5;
  const durationMax = selectedModel?.maxDuration ?? 300;
  useEffect(() => {
    setDraft((previous) =>
      previous.duration >= durationMin && previous.duration <= durationMax
        ? previous
        : {
            ...previous,
            duration: Math.max(
              durationMin,
              Math.min(durationMax, previous.duration),
            ),
          },
    );
  }, [durationMin, durationMax]);
  useEffect(() => {
    if (!online) {
      setTracks([]);
      return;
    }
    if (view !== "library" || filters.some((rule) => !validFilter(rule)))
      return;
    let current = true;
    const timer = setTimeout(() => {
      const query = new URLSearchParams({
        search,
        sort,
        match: filterMatch,
        filters: JSON.stringify(filters.map(({ id, ...rule }) => rule)),
      });
      api<Track[]>("/api/library?" + query)
        .then((data) => {
          if (current) setTracks(data);
        })
        .catch((error) => {
          if (current) setNotice(error.message);
        });
    }, 160);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [online, view, state.tracks, search, sort, filters, filterMatch, api]);
  const act = async (fn: () => Promise<unknown>, message = "") => {
    try {
      await fn();
      if (message) setNotice(message);
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const enqueue = async () => {
    setBusy(true);
    await act(() => api("/api/queue", "POST", draft), "큐에 등록했습니다");
    setBusy(false);
  };
  const modelAction = async (model: Model, operation: string) => {
    setPending((p) => new Set(p).add(model.id));
    await act(() =>
      api(
        `/api/models/${model.id}${operation === "delete" ? "" : "/" + operation}`,
        operation === "delete" ? "DELETE" : "POST",
      ),
    );
    setPending((p) => {
      const next = new Set(p);
      next.delete(model.id);
      return next;
    });
  };
  const position = selectedTrack
    ? Math.min(
        selectedTrack.duration,
        state.player.position +
          (state.player.playing
            ? Math.max(0, (now + clockOffset - state.player.updatedAt) / 1000)
            : 0),
      )
    : 0;
  const mediaUrl =
    online && selectedTrack && state.player.target === "browser"
      ? new URL(selectedTrack.mediaPath, location.origin).href
      : null;
  const audioSource = mediaUrl;
  // The server owns transport state. Browser audio is a streaming output only.
  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    if (
      !online ||
      !selectedTrack ||
      state.player.target !== "browser" ||
      !audioSource
    ) {
      a.pause();
      if (!audioSource && a.hasAttribute("src")) {
        a.removeAttribute("src");
        a.load();
      }
      return;
    }
    let cancelled = false;
    const sync = () => {
      const desired = Math.min(
        selectedTrack.duration,
        state.player.position +
          (state.player.playing
            ? Math.max(
                0,
                (Date.now() + clockOffset - state.player.updatedAt) / 1000,
              )
            : 0),
      );
      if (Math.abs(a.currentTime - desired) > 0.8) a.currentTime = desired;
      a.volume = state.player.volume;
      if (state.player.playing)
        a.play()
          .then(() => {
            if (!cancelled) setAudioBlocked(false);
          })
          .catch(() => {
            if (!cancelled) setAudioBlocked(true);
          });
      else a.pause();
    };
    if (a.src !== audioSource) {
      a.addEventListener("loadedmetadata", sync, { once: true });
      a.src = audioSource;
    } else sync();
    return () => {
      cancelled = true;
      a.removeEventListener("loadedmetadata", sync);
    };
  }, [online, selectedTrack, state.player, audioSource, clockOffset, audioReload]);
  const playTrack = (track: Track) => {
    setAudioReload((value) => value + 1);
    void act(() =>
      api("/api/player", "PATCH", {
        trackId: track.id,
        playing: true,
        position: 0,
      }),
    );
  };
  const reorder = (job: Job, delta: number) => {
    const ids = activeJobs
      .filter((j) => j.status === "queued")
      .map((j) => j.id);
    const index = ids.indexOf(job.id);
    if (index + delta < 0 || index + delta >= ids.length) return;
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    void act(() => api("/api/queue/reorder", "POST", { ids }));
  };
  const trackList = (items: Track[], filtered = false) => (
    <TrackList
      tracks={items}
      models={state.models}
      selectedId={state.player.trackId}
      playing={state.player.playing}
      filtered={filtered}
      onPlay={playTrack}
      onDetail={setDetail}
      onRegenerate={(track) =>
        void act(
          () => api(`/api/library/${track.id}/regenerate`, "POST"),
          "재생성 큐에 등록했습니다",
        )
      }
      onDelete={(track) =>
        setConfirm({
          text: `‘${track.title}’ 음악 파일을 서버에서 삭제할까요?`,
          action: () => api(`/api/library/${track.id}`, "DELETE"),
        })
      }
    />
  );
  const completed = (
    <section className="completed" aria-labelledby="completed-heading">
      <div className="section-heading">
        <h2 id="completed-heading">
          완료 <span className="count">{state.tracks.length}</span>
        </h2>
      </div>
      {trackList([...state.tracks].sort((a, b) => b.createdAt - a.createdAt))}
    </section>
  );
  const library = (
    <section className="library" aria-labelledby="library-heading">
      <div className="section-heading">
        <h2 id="library-heading">
          라이브러리{" "}
          <span className="count">
            {tracks.length} / {state.tracks.length}
          </span>
        </h2>
      </div>
      <div className="library-tools">
        <label className="search">
          <Search />
          <input
            aria-label="음악 검색"
            placeholder="음악 검색"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <select
          aria-label="정렬"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
        >
          <option value="newest">최신순</option>
          <option value="oldest">오래된순</option>
          <option value="title">이름순</option>
          <option value="bpm">BPM순</option>
          <option value="duration">길이순</option>
          {Object.entries(scoreLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}순
            </option>
          ))}
        </select>
      </div>
      <LibraryFilters
        rules={filters}
        match={filterMatch}
        models={state.models}
        tracks={state.tracks}
        onChange={setFilters}
        onMatchChange={setFilterMatch}
      />
      {trackList(tracks, Boolean(search || filters.length))}
    </section>
  );
  return (
    <div className="app">
      <header className="header">
        <a
          className="wordmark"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView("studio");
          }}
        >
          music<span>Q</span>
        </a>
        <nav aria-label="주 메뉴">
          {(
            [
              { id: "studio", label: "스튜디오", icon: ListMusic },
              { id: "library", label: "라이브러리", icon: Headphones },
              { id: "models", label: "모델", icon: HardDrive },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "active" : ""}
              onClick={() => setView(item.id)}
            >
              <item.icon />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="server-status" role="status" title={studio.error || "서버 실행 중"}>
          <span className={"status-dot " + (online ? "online" : "")} />
          <span>{online ? "실행 중" : status === "reconnecting" ? "다시 연결 중" : "시작 중"}</span>
        </div>
      </header>
      <main>
        <div className="page-heading">
          <div className="title-row">
            <h1>
              {view === "studio"
                ? "스튜디오"
                : view === "library"
                  ? "라이브러리"
                  : "모델 관리"}
            </h1>
          </div>
        </div>
        {view === "studio" ? (
          <div className="workspace">
            <aside className="composer">
              <div className="composer-heading">
                <h2>새 음악</h2>
              </div>
              <div className="segmented" role="group" aria-label="생성 방식">
                <button
                  className={draft.mode === "guided" ? "active" : ""}
                  onClick={() => update("mode", "guided")}
                >
                  간편 설정
                </button>
                <button
                  className={draft.mode === "prompt" ? "active" : ""}
                  onClick={() => update("mode", "prompt")}
                >
                  프롬프트
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void enqueue();
                }}
              >
                <label className="field">
                  모델
                  <div className="model-field">
                    <select
                      value={draft.modelId}
                      onChange={(e) => {
                        update("modelId", e.target.value);
                        const m = installed.find(
                          (m) => m.id === e.target.value,
                        );
                        if (m && draft.duration < (m.minDuration ?? 5))
                          update("duration", m.minDuration ?? 5);
                        if (m && draft.duration > m.maxDuration)
                          update("duration", m.maxDuration);
                      }}
                      aria-label="생성 모델"
                    >
                      {!installed.length && (
                        <option value="demo">모델 불러오는 중</option>
                      )}
                      {installed.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="모델 관리"
                      onClick={() => setView("models")}
                    >
                      <Settings2 />
                    </button>
                  </div>
                </label>

                <label className="field">
                  이름 <span className="optional">선택</span>
                  <input
                    maxLength={100}
                    value={draft.title}
                    placeholder="새로운 트랙"
                    onChange={(e) => update("title", e.target.value)}
                  />
                </label>
                {draft.mode === "prompt" && (
                  <label className="field">
                    프롬프트
                    <textarea
                      rows={4}
                      maxLength={3000}
                      required
                      value={draft.prompt}
                      placeholder="비 오는 저녁, 부드러운 피아노와 느린 드럼"
                      onChange={(e) => update("prompt", e.target.value)}
                    />
                  </label>
                )}
                <div className="field">
                  <span id="genre-label">장르</span>
                  <div
                    className="choice-grid"
                    role="group"
                    aria-labelledby="genre-label"
                  >
                    {genres.map((g) => (
                      <button
                        key={g}
                        type="button"
                        className={draft.genre === g ? "chosen" : ""}
                        onClick={() => update("genre", g)}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="field">
                  느낌
                  <select
                    value={draft.mood}
                    onChange={(e) => update("mood", e.target.value)}
                  >
                    {moods.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  용도
                  <select
                    value={draft.category}
                    onChange={(event) => update("category", event.target.value)}
                  >
                    {categories.map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                </label>
                <label className="range-field">
                  <span>
                    길이{" "}
                    <b className="mono">
                      {draft.duration}
                      <span> 초</span>
                    </b>
                  </span>
                  <input
                    aria-label="음악 길이"
                    type="range"
                    min={durationMin}
                    max={durationMax}
                    step={1}
                    value={draft.duration}
                    onChange={(event) =>
                      update("duration", Number(event.target.value))
                    }
                  />
                  <span className="range-ends">
                    <span>{durationMin}초</span>
                    <span>{durationMax}초</span>
                  </span>
                </label>
                <label className="range-field">
                  <span>
                    템포{" "}
                    <b className="mono">
                      {draft.bpm} <span>BPM</span>
                    </b>
                  </span>
                  <input
                    type="range"
                    min={40}
                    max={200}
                    value={draft.bpm}
                    onChange={(e) => update("bpm", +e.target.value)}
                  />
                  <span className="range-ends">
                    <span>느리게</span>
                    <span>빠르게</span>
                  </span>
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={draft.instrumental}
                    onChange={(e) => update("instrumental", e.target.checked)}
                  />
                  보컬 없이
                </label>
                <details className="advanced">
                  <summary>
                    속성 조절 <ChevronRight />
                  </summary>
                  {Object.entries(scoreLabels).map(([key, label]) => (
                    <label className="score-control" key={key}>
                      <span>{label}</span>
                      <input
                        aria-label={label}
                        type="range"
                        min={0}
                        max={100}
                        value={draft.scores[key as keyof Scores] ?? 50}
                        onChange={(e) =>
                          update("scores", {
                            ...draft.scores,
                            [key]: +e.target.value,
                          })
                        }
                      />
                      <span className="mono">
                        {draft.scores[key as keyof Scores] ?? "자동"}
                      </span>
                    </label>
                  ))}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => update("scores", {})}
                  >
                    자동 점수로 초기화
                  </button>
                </details>
                <button
                  className="primary enqueue"
                  disabled={
                    !online ||
                    busy ||
                    !installed.some((m) => m.id === draft.modelId)
                  }
                >
                  {busy ? <LoaderCircle className="spin" /> : <Plus />}큐에 추가
                </button>
              </form>
            </aside>
            <div className="workspace-content">
              <section className="queue">
                <div className="section-heading">
                  <div>
                    <h2>
                      생성 큐 <span className="count">{activeJobs.length}</span>
                      {state.paused && (
                        <span className="paused-label">일시 정지</span>
                      )}
                    </h2>
                  </div>
                  <button
                    className="secondary small"
                    disabled={!online}
                    onClick={() =>
                      void act(() =>
                        api("/api/queue", "PATCH", { paused: !state.paused }),
                      )
                    }
                  >
                    {state.paused ? <Play /> : <Pause />}
                    {state.paused ? "큐 시작" : "큐 정지"}
                  </button>
                </div>
                {activeJobs.length ? (
                  <div className="queue-list">
                    {activeJobs.map((job, i) => (
                      <div
                        className={
                          "queue-row " +
                          (job.status !== "queued" ? "generating" : "")
                        }
                        key={job.id}
                      >
                        <span className="queue-index mono">
                          {job.status === "running" ? (
                            <Activity />
                          ) : (
                            String(i + 1).padStart(2, "0")
                          )}
                        </span>
                        <div className="queue-title">
                          <strong>
                            {job.plan?.title ||
                              job.request.title ||
                              `${job.request.mood} ${job.request.genre}`}
                          </strong>
                          <small>
                            {
                              state.models.find(
                                (m) => m.id === job.request.modelId,
                              )?.name
                            }{" "}
                            <span>·</span> {job.request.genre} <span>·</span>{" "}
                            {job.request.duration}초
                          </small>
                          {job.plan && (
                            <div className="plan-chips">
                              {Object.entries(job.plan.scores)
                                .slice(0, 3)
                                .map(([k, v]) => (
                                  <span key={k}>
                                    {scoreLabels[k as keyof Scores]} {v}
                                  </span>
                                ))}
                            </div>
                          )}
                        </div>
                        <span className={"job-status " + job.status}>
                          {labels[job.status]}
                          {job.startedAt && job.status === "running" && (
                            <small>
                              {time(
                                Math.max(
                                  0,
                                  (now + clockOffset - job.startedAt) / 1000,
                                ),
                              )}
                            </small>
                          )}
                        </span>
                        <div className="row-actions">
                          {job.status === "queued" ? (
                            <>
                              <button
                                className="icon-button"
                                aria-label="큐 위로"
                                disabled={
                                  activeJobs.filter(
                                    (j) => j.status === "queued",
                                  )[0]?.id === job.id
                                }
                                onClick={() => reorder(job, -1)}
                              >
                                <ArrowUp />
                              </button>
                              <button
                                className="icon-button"
                                aria-label="큐 아래로"
                                disabled={
                                  activeJobs
                                    .filter((j) => j.status === "queued")
                                    .at(-1)?.id === job.id
                                }
                                onClick={() => reorder(job, 1)}
                              >
                                <ArrowDown />
                              </button>
                              <button
                                className="icon-button"
                                aria-label="큐 삭제"
                                onClick={() =>
                                  void act(() =>
                                    api(`/api/queue/${job.id}`, "DELETE"),
                                  )
                                }
                              >
                                <X />
                              </button>
                            </>
                          ) : (
                            <button
                              className="icon-button stop"
                              aria-label="생성 중단"
                              onClick={() =>
                                void act(() =>
                                  api(`/api/queue/${job.id}/cancel`, "POST"),
                                )
                              }
                            >
                              <Square />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty queue-empty">
                    <div>
                      <h3>대기 중인 작업 없음</h3>
                    </div>
                  </div>
                )}
                {recentJobs.map((job) => (
                  <div className="job-error" key={job.id}>
                    <span>
                      {labels[job.status]} ·{" "}
                      {job.request.title || job.request.genre}
                      {job.error && <small>{job.error}</small>}
                    </span>
                    <button
                      className="icon-button"
                      aria-label="다시 등록"
                      onClick={() =>
                        void act(() =>
                          api(`/api/queue/${job.id}/retry`, "POST"),
                        )
                      }
                    >
                      <RotateCcw />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="기록 삭제"
                      onClick={() =>
                        void act(() => api(`/api/queue/${job.id}`, "DELETE"))
                      }
                    >
                      <X />
                    </button>
                  </div>
                ))}
              </section>
              {completed}
            </div>
          </div>
        ) : view === "library" ? (
          library
        ) : (
          <section className="models">
            <div className="section-heading">
              <div>
                <h2>
                  음악 생성 모델{" "}
                  <span className="count">{installed.length}</span>
                </h2>
              </div>
            </div>
            <div className="model-list">
              {state.models.length ? (
                state.models.map((model) => (
                  <article className="model-card" key={model.id}>
                    <div className="model-info">
                      <h3>
                        {model.name}
                        {model.status === "installed" && (
                          <span className="installed">
                            <Check />
                            설치됨
                          </span>
                        )}
                      </h3>

                      <div className="model-meta">
                        <span>{model.parameters || model.size}</span>
                        <span>최대 {model.maxDuration}초</span>
                        {model.hardware && <span>{model.hardware}</span>}
                        {model.access && <span>{model.access}</span>}
                        {model.license && <span>{model.license}</span>}
                      </div>
                      {model.status === "installing" && (
                        <p className="install-progress">
                          <LoaderCircle className="spin" />
                          {model.phase || "설치 중"}
                        </p>
                      )}
                      {model.error && (
                        <p className="error-text">{model.error}</p>
                      )}
                    </div>
                    <div className="model-actions">
                      {model.status === "installing" ? (
                        <button
                          className="secondary"
                          disabled={pending.has(model.id)}
                          onClick={() => void modelAction(model, "cancel")}
                        >
                          <X />
                          설치 취소
                        </button>
                      ) : model.status === "installed" ? (
                        <>
                          <button
                            className="secondary"
                            onClick={() => {
                              update("modelId", model.id);
                              if (draft.duration < (model.minDuration ?? 5))
                                update("duration", model.minDuration ?? 5);
                              if (draft.duration > model.maxDuration)
                                update("duration", model.maxDuration);
                              setView("studio");
                            }}
                          >
                            선택
                            <ChevronRight />
                          </button>
                          {model.repo && (
                            <button
                              className="icon-button"
                              disabled={pending.has(model.id)}
                              aria-label={`${model.name} 삭제`}
                              onClick={() =>
                                setConfirm({
                                  text: `${model.name}을 서버에서 삭제할까요?`,
                                  action: () => modelAction(model, "delete"),
                                })
                              }
                            >
                              <Trash2 />
                            </button>
                          )}
                        </>
                      ) : (
                        <button
                          className="secondary"
                          disabled={
                            !online ||
                            pending.has(model.id) ||
                            state.models.some((m) => m.status === "installing")
                          }
                          onClick={() =>
                            setConfirm({
                              text: `${model.name} (${model.size})을 서버에 다운로드하고 Python 실행 환경을 설치할까요?`,
                              action: () => modelAction(model, "install"),
                            })
                          }
                        >
                          <Download />
                          {model.status === "failed" ? "다시 설치" : "설치"}
                        </button>
                      )}
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty">
                  <h3>서버에 연결해 주세요</h3>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
      <footer className="player">
        <div className="now-playing">
          <div>
            <strong>{selectedTrack?.title || "재생 안 함"}</strong>
            {selectedTrack && (
              <small>
                {selectedTrack.genre} · {selectedTrack.mood}
              </small>
            )}
          </div>
        </div>
        <div className="transport">
          <div className="transport-buttons">
            <button
              className="icon-button"
              aria-label="처음부터 재생"
              disabled={!online || !selectedTrack}
              onClick={() =>
                void act(() => api("/api/player", "PATCH", { position: 0 }))
              }
            >
              <RotateCcw />
            </button>
            <button
              className="play-button"
              aria-label={state.player.playing ? "일시 정지" : "재생"}
              disabled={!online || !selectedTrack}
              onClick={() =>
                void act(() =>
                  api("/api/player", "PATCH", {
                    playing: !state.player.playing,
                  }),
                )
              }
            >
              {state.player.playing ? <Pause /> : <Play />}
            </button>
            <button
              className="icon-button"
              aria-label="재생 정지"
              disabled={!online || !selectedTrack}
              onClick={() =>
                void act(() =>
                  api("/api/player", "PATCH", { playing: false, position: 0 }),
                )
              }
            >
              <Square />
            </button>
          </div>
          <div className="timeline">
            <span className="mono">{time(position)}</span>
            <input
              aria-label="재생 위치"
              type="range"
              min={0}
              max={selectedTrack?.duration || 1}
              step={0.1}
              value={position}
              disabled={!online || !selectedTrack}
              onChange={(e) =>
                void act(() =>
                  api("/api/player", "PATCH", { position: +e.target.value }),
                )
              }
            />
            <span className="mono">{time(selectedTrack?.duration || 0)}</span>
          </div>
        </div>
        <div className="output">
          <select
            aria-label="재생 장치"
            value={state.player.target}
            disabled={!online || !selectedTrack}
            onChange={(e) =>
              void act(() =>
                api("/api/player", "PATCH", { target: e.target.value }),
              )
            }
          >
            <option value="browser">이 브라우저</option>
            <option value="server">서버 PC</option>
          </select>
          <Volume2 />
          <input
            aria-label="음량"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={state.player.volume}
            disabled={!online || !selectedTrack}
            onChange={(e) =>
              void act(() =>
                api("/api/player", "PATCH", { volume: +e.target.value }),
              )
            }
          />
        </div>
      </footer>
      <audio
        ref={audio}
        onError={() => {
          if (selectedTrack && online)
            setNotice(
              "오디오를 불러오지 못했습니다. 서버 연결을 확인해 주세요",
            );
        }}
      />
      {audioBlocked && selectedTrack && state.player.playing && (
        <button
          className="audio-unlock secondary"
          onClick={() =>
            void audio.current
              ?.play()
              .then(() => setAudioBlocked(false))
              .catch(() =>
                setNotice("브라우저의 오디오 재생 권한을 확인해 주세요"),
              )
          }
        >
          <Play />이 브라우저에서 소리 켜기
        </button>
      )}
      {state.player.error && (
        <div className="player-error" role="alert">
          {state.player.error}
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button
            className="icon-button"
            aria-label="알림 닫기"
            onClick={() => setNotice("")}
          >
            <X />
          </button>
        </div>
      )}
      {detail && (
        <Dialog title={detail.title} onClose={() => setDetail(null)}>
          <div className="detail-meta">
            {detail.genre} · {detail.mood} · {detail.category} ·{" "}
            {time(detail.duration)}
          </div>
          <div className="score-bars">
            {Object.entries(detail.scores).map(([k, v]) => (
              <div key={k}>
                <span>{scoreLabels[k as keyof Scores]}</span>
                <div className="score-bar">
                  <span style={{ width: `${v}%` }} />
                </div>
                <span className="mono">{v}</span>
              </div>
            ))}
          </div>

          <label className="field">
            생성 프롬프트
            <textarea readOnly rows={5} value={detail.resolvedPrompt} />
          </label>
          <div className="detail-meta mono">시드 {detail.seed}</div>
          <button
            className="primary"
            onClick={() => {
              void act(
                () => api(`/api/library/${detail.id}/regenerate`, "POST"),
                "재생성 큐에 등록했습니다",
              );
              setDetail(null);
            }}
          >
            <RotateCcw />
            같은 설정으로 재생성
          </button>
        </Dialog>
      )}
      {confirm && (
        <Dialog title="확인" onClose={() => setConfirm(null)}>
          <p className="confirm-copy">{confirm.text}</p>
          <div className="dialog-actions">
            <button className="secondary" onClick={() => setConfirm(null)}>
              취소
            </button>
            <button
              className="primary"
              onClick={() => {
                const action = confirm.action;
                setConfirm(null);
                void act(action);
              }}
            >
              진행
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className="dialog"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="닫기" onClick={onClose}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
