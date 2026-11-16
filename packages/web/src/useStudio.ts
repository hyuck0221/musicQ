import { useCallback, useEffect, useState } from "react";
import { emptyState } from "./types";
import type { State } from "./types";

export function useStudio() {
  const [state, setState] = useState<State>(emptyState);
  const [status, setStatus] = useState<"connecting" | "online" | "reconnecting">("connecting");
  const [error, setError] = useState("");
  const [clockOffset, setClockOffset] = useState(0);
  const api = useCallback(async <T>(path: string, method = "GET", body?: unknown): Promise<T> => {
    let response: Response;
    try {
      response = await fetch(path, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new Error("서버가 응답하지 않습니다. 잠시 후 다시 시도해 주세요");
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "서버 요청에 실패했습니다");
    return data;
  }, []);
  useEffect(() => {
    // Remove credentials saved by the former standalone control panel.
    try { localStorage.removeItem("musicq.connection"); } catch { /* storage may be disabled */ }
    let stopped = false;
    let socket: WebSocket | undefined;
    let timer: ReturnType<typeof setTimeout>;
    let retries = 0;
    const open = () => {
      if (stopped) return;
      const url = new URL("/ws", location.href);
      url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(url);
      socket = ws;
      ws.onmessage = (event) => {
        if (stopped) return;
        try {
          const next = JSON.parse(event.data) as State;
          if (!Array.isArray(next.jobs) || !Array.isArray(next.models)) throw new Error();
          setClockOffset(next.serverTime - Date.now());
          setState(next);
          setStatus("online");
          setError("");
          retries = 0;
        } catch {
          setError("서버 응답을 확인해 주세요");
          ws.close();
        }
      };
      ws.onclose = () => {
        if (stopped) return;
        setStatus("reconnecting");
        setError("서버를 기다리는 중입니다");
        timer = setTimeout(open, Math.min(1000 * 2 ** retries++, 15000));
      };
      ws.onerror = () => ws.close();
    };
    open();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, []);
  return { state, status, error, api, clockOffset };
}
