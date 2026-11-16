import { AudioLines, Play, RotateCcw, Trash2 } from "lucide-react";
import { time } from "./types";
import type { Model, Track } from "./types";

export default function TrackList({
  tracks,
  models,
  selectedId,
  playing,
  filtered,
  onPlay,
  onDetail,
  onRegenerate,
  onDelete,
}: {
  tracks: Track[];
  models: Model[];
  selectedId: string | null;
  playing: boolean;
  filtered?: boolean;
  onPlay: (track: Track) => void;
  onDetail: (track: Track) => void;
  onRegenerate: (track: Track) => void;
  onDelete: (track: Track) => void;
}) {
  if (!tracks.length)
    return (
      <div className="empty library-empty">
        <h3>{filtered ? "일치하는 음악 없음" : "완료된 음악 없음"}</h3>
      </div>
    );
  return (
    <div className="track-table">
      <div className="table-head">
        <span>트랙</span>
        <span>장르 / 느낌</span>
        <span>BPM</span>
        <span>길이</span>
        <span />
      </div>
      {tracks.map((track, index) => (
        <div
          className={
            "track-row " + (selectedId === track.id ? "is-playing" : "")
          }
          key={track.id}
        >
          <div className="track-name">
            <button
              className="track-play"
              aria-label={`${track.title} 재생`}
              onClick={() => onPlay(track)}
            >
              {selectedId === track.id && playing ? (
                <AudioLines />
              ) : (
                <>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <Play />
                </>
              )}
            </button>
            <button className="track-title" onClick={() => onDetail(track)}>
              {track.title}
              <small>
                {models.find((model) => model.id === track.modelId)?.name ??
                  track.modelId}{" "}
                ·{" "}
                {new Date(track.createdAt).toLocaleDateString("ko-KR", {
                  month: "short",
                  day: "numeric",
                })}
              </small>
            </button>
          </div>
          <div className="track-tags">
            {track.genre}
            <small>{track.mood}</small>
          </div>
          <span className="mono">{track.bpm}</span>
          <span className="mono">{time(track.duration)}</span>
          <div className="row-actions">
            <button
              className="icon-button"
              aria-label={`${track.title} 재생성`}
              onClick={() => onRegenerate(track)}
            >
              <RotateCcw />
            </button>
            <button
              className="icon-button"
              aria-label={`${track.title} 삭제`}
              onClick={() => onDelete(track)}
            >
              <Trash2 />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
