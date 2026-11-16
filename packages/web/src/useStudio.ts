import { normalizeConnection, readSavedConnection } from "./connection";
import {
  authorizeServer,
  localPermissionMessage,
  needsLocalPermission,
  queryServerPermission,
  serverConnectionError,
  serverRequestOptions,
} from "./localNetwork";
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
    "offline" | "connecting" | "online" | "reconnecting" | "permission"
  >(saved ? "connecting" : "offline");
  const [error, setError] = useState("");
  const [session, setSession] = useState<Connection | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const current = useRef(session);
  current.current = session;
  const attempt = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const api = useCallback(
    async <T>(path: string, method = "GET", body?: unknown): Promise<T> => {
      const c = current.current;
      if (!c) throw new Error("서버에 연결해 주세요");
      let response: Response;
      try {
        response = await fetch(
          c.url + path,
          serverRequestOptions(c.url, {
            method,
            headers: {
              Authorization: `Bearer ${c.token}`,
              ...(body !== undefined
                ? { "Content-Type": "application/json" }
                : {}),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(12000),
          }),
        );
      } catch {
        throw new Error(serverConnectionError(c.url));
      }
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "서버 요청에 실패했습니다");
      return data;
    },
    [],
  );
  useEffect(() => {
    if (!saved) return;
    let cancelled = false;
    const id = ++attempt.current;
    void queryServerPermission(
      saved.url,
      location.protocol,
      navigator.permissions,
    ).then((permission) => {
      if (cancelled || id !== attempt.current) return;
      if (permission === "granted") setSession(saved);
      else {
        setStatus("permission");
        setError(localPermissionMessage(permission));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [saved]);
  const connect = async (input: Connection) => {
    const id = ++attempt.current;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    let validated = false;
    try {
      const c = normalizeConnection(input, location.protocol);
      validated = true;
      setState(emptyState);
      setError("");
      setStatus("connecting");
      setConnection(c);
      setSession(null);
      await authorizeServer(
        c.url,
        location.protocol,
        controller.signal,
        navigator.permissions,
      );
      if (id === attempt.current && !controller.signal.aborted) setSession(c);
      else if (id === attempt.current)
        throw new Error("연결 시간이 초과되었습니다. 다시 연결해 주세요");
    } catch (failure) {
      if (id === attempt.current) {
        if (validated) setStatus("offline");
        setError((failure as Error).message);
      }
    } finally {
      clearTimeout(timeout);
      if (pending.current === controller) pending.current = null;
    }
  };
  useEffect(() => {
    if (!session) return;
    let stopped = false,
      socket: WebSocket | undefined,
      timer: ReturnType<typeof setTimeout>,
      retries = 0;
    const open = () => {
      if (stopped) return;
      try {
        socket = new WebSocket(session.url.replace(/^http/, "ws") + "/ws");
      } catch {
        setStatus("offline");
        setError(serverConnectionError(session.url));
        return;
      }
      const ws = socket;
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
          const next = JSON.parse(event.data) as State;
          if (!Array.isArray(next.jobs) || !Array.isArray(next.models))
            throw new Error("musicQ 서버 응답이 아닙니다");
          setClockOffset(next.serverTime - Date.now());
          setState(next);
          setStatus("online");
          setError("");
          retries = 0;
          persist("musicq.connection", session);
        } catch (failure) {
          setError((failure as Error).message);
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
        setError(serverConnectionError(session.url));
        timer = setTimeout(
          () => {
            void queryServerPermission(
              session.url,
              location.protocol,
              navigator.permissions,
            ).then((permission) => {
              if (stopped) return;
              if (
                needsLocalPermission(session.url, location.protocol) &&
                permission !== "granted"
              ) {
                setStatus("permission");
                setError(localPermissionMessage(permission));
                return;
              }
              open();
            });
          },
          Math.min(1000 * 2 ** retries++, 15000),
        );
      };
      ws.onerror = () => ws.close();
    };
    open();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, [session]);
  useEffect(
    () => () => {
      pending.current?.abort();
    },
    [],
  );
  const disconnect = () => {
    ++attempt.current;
    pending.current?.abort();
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
