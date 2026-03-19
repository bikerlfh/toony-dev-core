"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WsReadyState } from "@/types";

const AUTH_CLOSE_CODES = new Set([4001, 4003]);
const MAX_RETRIES = 10;

interface UseWebSocketOptions {
  url: string | null | (() => string | null);
  onMessage?: (data: unknown) => void;
  onOpen?: () => void;
  onClose?: (code: number) => void;
  reconnect?: boolean;
}

export function useWebSocket({
  url,
  onMessage,
  onOpen,
  onClose,
  reconnect = true,
}: UseWebSocketOptions) {
  const [readyState, setReadyState] = useState<WsReadyState>(3); // CLOSED
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable callback refs to avoid reconnection on re-render
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const connect = useCallback(() => {
    const resolvedUrl = typeof url === "function" ? url() : url;
    if (!resolvedUrl) return;

    const ws = new WebSocket(resolvedUrl);
    wsRef.current = ws;
    setReadyState(0); // CONNECTING

    ws.onopen = () => {
      setReadyState(1); // OPEN
      retriesRef.current = 0;
      onOpenRef.current?.();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessageRef.current?.(data);
      } catch {
        // Ignore non-JSON messages
      }
    };

    ws.onclose = (event) => {
      setReadyState(3); // CLOSED
      onCloseRef.current?.(event.code);

      // Don't reconnect on auth failures or intentional closure
      if (
        !reconnect ||
        AUTH_CLOSE_CODES.has(event.code) ||
        event.code === 1000 ||
        retriesRef.current >= MAX_RETRIES
      ) {
        return;
      }

      // Exponential backoff: 1s, 2s, 4s, 8s, ...
      const delay = Math.min(1000 * 2 ** retriesRef.current, 30000);
      retriesRef.current += 1;
      timeoutRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      // onerror is always followed by onclose — no action needed
    };
  }, [url, reconnect]);

  useEffect(() => {
    connect();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (wsRef.current) {
        // Nullify handlers before close to prevent reconnection
        const ws = wsRef.current;
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.close(1000);
        wsRef.current = null;
      }
      setReadyState(3);
    };
  }, [connect]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { readyState, send };
}
