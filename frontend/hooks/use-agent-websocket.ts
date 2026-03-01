"use client";

import { useCallback, useMemo } from "react";
import { getAccessToken } from "@/lib/auth";
import { useWebSocket } from "@/hooks/use-websocket";
import type { AgentWsEvent, WsReadyState } from "@/types";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

interface UseAgentWebSocketOptions {
  agentId: string | null;
  onEvent: (event: AgentWsEvent) => void;
}

export function useAgentWebSocket({
  agentId,
  onEvent,
}: UseAgentWebSocketOptions): {
  readyState: WsReadyState;
  sendTaskResult: (taskId: string, output: unknown) => void;
  sendStatusUpdate: (status: string) => void;
  sendHeartbeat: () => void;
} {
  const url = useMemo(() => {
    if (!agentId) return null;
    const token = getAccessToken();
    if (!token) return null;
    return `${WS_BASE}/ws/agents/${agentId}/?token=${token}`;
  }, [agentId]);

  const handleMessage = useCallback(
    (data: unknown) => {
      const event = data as AgentWsEvent;
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
