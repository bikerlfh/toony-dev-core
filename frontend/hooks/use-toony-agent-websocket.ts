"use client";

import { useCallback, useMemo } from "react";
import { getAccessToken } from "@/lib/auth";
import { useWebSocket } from "@/hooks/use-websocket";
import type { ToonyAgentWsEvent, WsReadyState } from "@/types";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

interface UseToonyAgentWebSocketOptions {
  agentId: string | null;
  onEvent: (event: ToonyAgentWsEvent) => void;
}

export function useToonyAgentWebSocket({
  agentId,
  onEvent,
}: UseToonyAgentWebSocketOptions): {
  readyState: WsReadyState;
  sendApproval: (taskId: string, action: string, response: string) => void;
  cancelTask: (taskId: string) => void;
} {
  const url = useMemo(() => {
    if (!agentId) return null;
    const token = getAccessToken();
    if (!token) return null;
    return `${WS_BASE}/ws/toony-agents/${agentId}/?token=${token}`;
  }, [agentId]);

  const handleMessage = useCallback(
    (data: unknown) => {
      const event = data as ToonyAgentWsEvent;
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

  const sendApproval = useCallback(
    (taskId: string, action: string, response: string) => {
      send({
        type: "approval.response",
        task_id: taskId,
        action,
        response,
      });
    },
    [send],
  );

  const cancelTask = useCallback(
    (taskId: string) => {
      send({ type: "task.cancel", task_id: taskId });
    },
    [send],
  );

  return { readyState, sendApproval, cancelTask };
}
