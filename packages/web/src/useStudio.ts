import { normalizeConnection, readSavedConnection } from "./connection";
import { useCallback, useEffect, useRef, useState } from "react";
import { emptyState, persist } from "./types";
import type { Connection, State } from "./types";
export function useStudio() {
  const [saved] = useState(() => {
    try {
      return readSavedConnection(window.localStorage, location.protocol);
    } catch {
      return null;
    }
  });
  const [connection, setConnection] = useState<Connection>(
    saved ?? { url: "http://localhost:4310", token: "" },
  );
  const [state, setState] = useState<State>(emptyState);
  const [status, setStatus] = useState<
    "offline" | "connecting" | "online" | "reconnecting"
  >(saved ? "connecting" : "offline");
  const [error, setError] = useState("");
  const [session, setSession] = useState<Connection | null>(saved);
  const [clockOffset, setClockOffset] = useState(0);
  const current = useRef(session);
  current.current = session;
  const api = useCallback(
    async <T>(path: string, method = "GET", body?: unknown): Promise<T> => {
      const c = current.current;
      if (!c) throw new Error("서버에 연결해 주세요");
      const res = await fetch(c.url + path, {
        method,
        headers: {
          Authorization: `Bearer ${c.token}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(12000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "서버 요청에 실패했습니다");
      return data;
    },
    [],
  );
  const connect = (input: Connection) => {
    try {
      const c = normalizeConnection(input, location.protocol);
      setState(emptyState);
      setError("");
      setStatus("connecting");
      setConnection(c);
      setSession(c);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    if (!session) return;
    let stopped = false,
      ws: WebSocket,
      timer: ReturnType<typeof setTimeout>,
      attempt = 0;
    const open = () => {
      if (stopped) return;
      ws = new WebSocket(session.url.replace(/^http/, "ws") + "/ws");
      ws.onopen = () => {
        if (stopped) {
          ws.close();
          return;
        }
        ws.send(JSON.stringify({ token: session.token }));
      };
      ws.onmessage = (event) => {
        if (stopped) return;
        try {
          const s = JSON.parse(event.data) as State;
          if (!Array.isArray(s.jobs) || !Array.isArray(s.models))
            throw new Error("musicQ 서버 응답이 아닙니다");
          setClockOffset(s.serverTime - Date.now());
          setState(s);
          setStatus("online");
          setError("");
          attempt = 0;
          persist("musicq.connection", session);
        } catch (e) {
          setError((e as Error).message);
          ws.close(4000);
        }
      };
      ws.onclose = (event) => {
        if (stopped) return;
        if (event.code === 4001 || event.code === 4000) {
          setStatus("offline");
          setError(
            event.code === 4001
              ? "연결 키를 확인해 주세요"
              : "서버 응답을 확인해 주세요",
          );
          return;
        }
        setStatus("reconnecting");
        setError(
          "연결을 다시 시도하고 있습니다. 주소·서버 실행·허용 웹 주소를 확인해 주세요",
        );
        timer = setTimeout(open, Math.min(1000 * 2 ** attempt++, 15000));
      };
      ws.onerror = () => ws.close();
    };
    open();
    return () => {
      stopped = true;
      clearTimeout(timer);
      if (ws) ws.close();
    };
  }, [session]);
  const disconnect = () => {
    setSession(null);
    setState(emptyState);
    setStatus("offline");
  };
  return {
    autoConnect: Boolean(saved),
    connection,
    state,
    status,
    error,
    setError,
    connect,
    disconnect,
    api,
    clockOffset,
  };
}
