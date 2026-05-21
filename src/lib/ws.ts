import { useAuth } from "@clerk/clerk-expo";
import Constants from "expo-constants";
import { useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import Toast from "react-native-toast-message";
import type { CallSnapshot, WsEvent, WsMessage } from "./ws-events";

function resolveWsBase(): string {
  const explicit = process.env.EXPO_PUBLIC_WS_BASE_URL;
  if (explicit) return explicit;
  const apiBase =
    process.env.EXPO_PUBLIC_API_BASE_URL ??
    (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
    "http://localhost:3000";
  // Flip http → ws (works for both http→ws and https→wss).
  return apiBase.replace(/^http/, "ws");
}

const WS_BASE = resolveWsBase();
const MAX_EVENTS = 200;
const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000] as const;

type Status = "connecting" | "open" | "closed" | "error";

export type CallWebSocketState = {
  snapshot: CallSnapshot["data"] | null;
  events: WsEvent[];
  status: Status;
};

export function useCallWebSocket(recoveryId: string | undefined): CallWebSocketState {
  const { getToken } = useAuth();
  const [snapshot, setSnapshot] = useState<CallSnapshot["data"] | null>(null);
  const [events, setEvents] = useState<WsEvent[]>([]);
  const [status, setStatus] = useState<Status>("connecting");

  const wsRef = useRef<WebSocket | null>(null);
  const backoffIdxRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedByUsRef = useRef(false);

  useEffect(() => {
    if (!recoveryId) return;
    let cancelled = false;
    closedByUsRef.current = false;

    async function connect() {
      if (cancelled) return;
      setStatus("connecting");
      let token: string | null;
      try {
        token = await getToken();
      } catch {
        token = null;
      }
      if (!token || cancelled) return;
      const url = `${WS_BASE}/ws/call/${recoveryId}?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        backoffIdxRef.current = 0;
        setStatus("open");
      };
      ws.onmessage = (evt) => {
        if (cancelled) return;
        try {
          const msg = JSON.parse(evt.data) as WsMessage;
          if (msg.type === "snapshot") {
            setSnapshot(msg.data);
          } else {
            setEvents((prev) => {
              const next = [...prev, msg];
              return next.length > MAX_EVENTS
                ? next.slice(next.length - MAX_EVENTS)
                : next;
            });
          }
        } catch (err) {
          console.warn("[ws] bad message:", err);
        }
      };
      ws.onerror = () => {
        if (cancelled) return;
        setStatus("error");
      };
      ws.onclose = () => {
        if (cancelled) return;
        setStatus("closed");
        if (closedByUsRef.current) return;
        // Surface a one-shot toast on first unexpected disconnect per
        // session. Repeated reconnect attempts don't re-toast (would spam).
        if (backoffIdxRef.current === 0) {
          Toast.show({
            type: "info",
            text1: "Connection lost",
            text2: "Reconnecting…",
            visibilityTime: 2000,
          });
        }
        scheduleReconnect();
      };
    }

    function scheduleReconnect() {
      if (cancelled) return;
      const delay =
        BACKOFF_MS[Math.min(backoffIdxRef.current, BACKOFF_MS.length - 1)] ??
        BACKOFF_MS[BACKOFF_MS.length - 1] ??
        16000;
      backoffIdxRef.current += 1;
      reconnectTimerRef.current = setTimeout(() => {
        void connect();
      }, delay);
    }

    function handleAppStateChange(nextState: AppStateStatus) {
      if (nextState === "active") {
        const ws = wsRef.current;
        if (
          !ws ||
          ws.readyState === WebSocket.CLOSED ||
          ws.readyState === WebSocket.CLOSING
        ) {
          void connect();
        }
      }
    }
    const appStateSub = AppState.addEventListener("change", handleAppStateChange);

    void connect();

    return () => {
      cancelled = true;
      closedByUsRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      appStateSub.remove();
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
      wsRef.current = null;
    };
    // Intentionally don't depend on getToken — Clerk's getToken isn't stable
    // across renders (logged in AGENT_PROGRESS.md). Depending on it would
    // tear down + recreate the WS on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recoveryId]);

  return { snapshot, events, status };
}

export type MerchantWebSocketState = {
  events: WsEvent[];
  status: Status;
};

/**
 * Subscribes to /ws/merchant. Emits recovery + call lifecycle events for the
 * authed merchant. Used by list + analytics screens to refetch on changes.
 */
export function useMerchantWebSocket(): MerchantWebSocketState {
  const { getToken, isSignedIn } = useAuth();
  const [events, setEvents] = useState<WsEvent[]>([]);
  const [status, setStatus] = useState<Status>("connecting");

  const wsRef = useRef<WebSocket | null>(null);
  const backoffIdxRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedByUsRef = useRef(false);

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    closedByUsRef.current = false;

    async function connect() {
      if (cancelled) return;
      setStatus("connecting");
      let token: string | null;
      try {
        token = await getToken();
      } catch {
        token = null;
      }
      if (!token || cancelled) return;
      const url = `${WS_BASE}/ws/merchant?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        backoffIdxRef.current = 0;
        setStatus("open");
      };
      ws.onmessage = (evt) => {
        if (cancelled) return;
        try {
          const msg = JSON.parse(evt.data) as WsMessage;
          if (msg.type !== "snapshot") {
            setEvents((prev) => {
              const next = [...prev, msg];
              return next.length > MAX_EVENTS
                ? next.slice(next.length - MAX_EVENTS)
                : next;
            });
          }
        } catch (err) {
          console.warn("[ws-merchant] bad message:", err);
        }
      };
      ws.onerror = () => {
        if (cancelled) return;
        setStatus("error");
      };
      ws.onclose = () => {
        if (cancelled) return;
        setStatus("closed");
        if (closedByUsRef.current) return;
        scheduleReconnect();
      };
    }

    function scheduleReconnect() {
      if (cancelled) return;
      const delay =
        BACKOFF_MS[Math.min(backoffIdxRef.current, BACKOFF_MS.length - 1)] ??
        BACKOFF_MS[BACKOFF_MS.length - 1] ??
        16000;
      backoffIdxRef.current += 1;
      reconnectTimerRef.current = setTimeout(() => {
        void connect();
      }, delay);
    }

    function handleAppStateChange(nextState: AppStateStatus) {
      if (nextState === "active") {
        const ws = wsRef.current;
        if (
          !ws ||
          ws.readyState === WebSocket.CLOSED ||
          ws.readyState === WebSocket.CLOSING
        ) {
          void connect();
        }
      }
    }
    const appStateSub = AppState.addEventListener("change", handleAppStateChange);

    void connect();

    return () => {
      cancelled = true;
      closedByUsRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      appStateSub.remove();
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  return { events, status };
}
