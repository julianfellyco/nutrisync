/**
 * WebSocket hook for real-time sync with the API server.
 *
 * Automatically reconnects on disconnect with exponential backoff.
 * Emits typed events that components can subscribe to.
 *
 * Usage:
 *   const { isConnected } = useWebSocket({
 *     onEvent: (event) => {
 *       if (event.event === 'new_log') refetchLogs();
 *     }
 *   });
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";

const WS_URL = process.env.EXPO_PUBLIC_WS_URL ?? "ws://localhost:8000";
const MAX_BACKOFF_MS = 30_000;

interface SyncEvent {
  event: string;
  log_type?: string;
  logged_at?: string;
  payload?: Record<string, unknown>;
  _channel?: string;
}

interface UseWebSocketOptions {
  onEvent?: (event: SyncEvent) => void;
  watchClientId?: string; // consultants: subscribe to a client's channel
}

export function useWebSocket({ onEvent, watchClientId }: UseWebSocketOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1000);
  const mountedRef = useRef(true);

  const connect = useCallback(async () => {
    const token = await AsyncStorage.getItem("access_token");
    if (!token || !mountedRef.current) return;

    const params = new URLSearchParams({ token });
    if (watchClientId) params.set("watch", watchClientId);
    const url = `${WS_URL}/ws?${params}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setIsConnected(true);
      backoffRef.current = 1000; // reset backoff on successful connect
    };

    ws.onmessage = (event) => {
      try {
        const data: SyncEvent = JSON.parse(event.data);
        onEvent?.(data);
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setIsConnected(false);
      // Exponential backoff reconnect
      const delay = backoffRef.current;
      backoffRef.current = Math.min(delay * 2, MAX_BACKOFF_MS);
      setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [watchClientId, onEvent]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      wsRef.current?.close();
    };
  }, [connect]);

  return { isConnected };
}
