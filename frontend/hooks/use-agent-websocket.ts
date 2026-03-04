"use client";

import { useCallback, useMemo } from "react";
import { getAccessToken } from "@/lib/auth";
import { useWebSocket } from "@/hooks/use-websocket";
import type { SubAgentWsEvent, WsReadyState } from "@/types";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

interface UseSubAgentWebSocketOptions {
  subAgentId: string | null;
  onEvent: (event: SubAgentWsEvent) => void;
}

export function useSubAgentWebSocket({
  subAgentId,
  onEvent,
}: UseSubAgentWebSocketOptions): {
  readyState: WsReadyState;
  sendTaskResult: (taskId: string, output: unknown) => void;
  sendStatusUpdate: (status: string) => void;
  sendHeartbeat: () => void;
} {
  const url = useMemo(() => {
    if (!subAgentId) return null;
    const token = getAccessToken();
    if (!token) return null;
    return `${WS_BASE}/ws/subagents/${subAgentId}/?token=${token}`;
  }, [subAgentId]);

  const handleMessage = useCallback(
    (data: unknown) => {
      const event = data as SubAgentWsEvent;
      if (event?.type) {
        onEvent(event);
      }
    },
    [onEvent],
  );

  const { readyState, send } = useWebSocket({
    url,
    onMessage: handleMessage,
  });

  const sendTaskResult = useCallback(
    (taskId: string, output: unknown) => {
      send({ type: "task.result", task_id: taskId, output });
    },
    [send],
  );

  const sendStatusUpdate = useCallback(
    (status: string) => {
      send({ type: "status.update", status });
    },
    [send],
  );

  const sendHeartbeat = useCallback(() => {
    send({ type: "heartbeat" });
  }, [send]);

  return { readyState, sendTaskResult, sendStatusUpdate, sendHeartbeat };
}
