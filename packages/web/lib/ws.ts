/**
 * WebSocket hook for the consultant portal.
 * Watches a specific client channel: wss://host/ws?token=...&watch=<clientId>
 */
"use client";

import { useEffect, useRef, useState } from "react";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
const MAX_BACKOFF = 30_000;

interface SyncEvent {
  event: string;
  log_type?: string;
  logged_at?: string;
  payload?: Record<string, unknown>;
}

export function useClientWebSocket(
  clientId: string | null,
  onEvent: (e: SyncEvent) => void,
) {
  const [connected, setConnected] = useState(false);
  const wsRef   = useRef<WebSocket | null>(null);
  const backoff = useRef(1_000);
  const mounted = useRef(true);

  useEffect(() => {
    if (!clientId) return;
    mounted.current = true;

    function connect() {
      const token = localStorage.getItem("access_token");
      if (!token || !mounted.current) return;

      const url = `${WS_BASE}/ws?token=${token}&watch=${clientId}`;
      const ws  = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen    = () => { setConnected(true); backoff.current = 1_000; };
      ws.onmessage = (e) => { try { onEvent(JSON.parse(e.data)); } catch {} };
      ws.onclose   = () => {
        setConnected(false);
        if (!mounted.current) return;
        setTimeout(connect, backoff.current);
        backoff.current = Math.min(backoff.current * 2, MAX_BACKOFF);
      };
      ws.onerror   = () => ws.close();
    }

    connect();
    return () => {
      mounted.current = false;
      wsRef.current?.close();
    };
  }, [clientId]);          // eslint-disable-line react-hooks/exhaustive-deps

  return connected;
}
