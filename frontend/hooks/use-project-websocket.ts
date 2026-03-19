"use client";

import { useCallback } from "react";
import { getAccessToken } from "@/lib/auth";
import { useWebSocket } from "@/hooks/use-websocket";
import type { ProjectWsEvent, WsReadyState } from "@/types";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

interface UseProjectWebSocketOptions {
  projectId: string | null;
  onEvent: (event: ProjectWsEvent) => void;
}

export function useProjectWebSocket({
  projectId,
  onEvent,
}: UseProjectWebSocketOptions): { readyState: WsReadyState } {
  const getUrl = useCallback(() => {
    if (!projectId) return null;
    const token = getAccessToken();
    if (!token) return null;
    return `${WS_BASE}/ws/projects/${projectId}/?token=${token}`;
  }, [projectId]);

  const handleMessage = useCallback(
    (data: unknown) => {
      const event = data as ProjectWsEvent;
      if (event?.type) {
        onEvent(event);
      }
    },
    [onEvent],
  );

  const { readyState } = useWebSocket({
    url: getUrl,
    onMessage: handleMessage,
  });

  return { readyState };
}
