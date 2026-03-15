"use client";

import { useCallback, useMemo } from "react";
import { getAccessToken } from "@/lib/auth";
import { useWebSocket } from "@/hooks/use-websocket";
import type { NotificationItem, WsReadyState } from "@/types";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

interface UseNotificationWebSocketOptions {
  enabled: boolean;
  onNotification: (notification: NotificationItem) => void;
}

export function useNotificationWebSocket({
  enabled,
  onNotification,
}: UseNotificationWebSocketOptions): { readyState: WsReadyState } {
  const url = useMemo(() => {
    if (!enabled) return null;
    const token = getAccessToken();
    if (!token) return null;
    return `${WS_BASE}/ws/notifications/?token=${token}`;
  }, [enabled]);

  const handleMessage = useCallback(
    (data: unknown) => {
      const event = data as { type: string; data: NotificationItem };
      if (event?.type === "notification.created" && event.data) {
        onNotification(event.data);
      }
    },
    [onNotification],
  );

  const { readyState } = useWebSocket({
    url,
    onMessage: handleMessage,
  });

  return { readyState };
}
