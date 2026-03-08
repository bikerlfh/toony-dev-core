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
  sendAnswer: (taskId: string, questionId: string, answer: string) => void;
  sendReply: (taskId: string, message: string) => void;
  cancelTask: (taskId: string) => void;
  sendConfigSync: () => void;
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

  const sendAnswer = useCallback(
    (taskId: string, questionId: string, answer: string) => {
      send({
        type: "question.answered",
        task_id: taskId,
        question_id: questionId,
        answer,
      });
    },
    [send],
  );

  const sendReply = useCallback(
    (taskId: string, message: string) => {
      send({ type: "task.reply", task_id: taskId, message });
    },
    [send],
  );

  const cancelTask = useCallback(
    (taskId: string) => {
      send({ type: "task.cancel", task_id: taskId });
    },
    [send],
  );

  const sendConfigSync = useCallback(() => {
    send({ type: "config.sync.request" });
  }, [send]);

  return { readyState, sendAnswer, sendReply, cancelTask, sendConfigSync };
}
