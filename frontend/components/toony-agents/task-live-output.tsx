"use client";

import { useEffect, useRef } from "react";
import { TaskEventItem } from "@/components/toony-agents/task-event-item";
import { TaskInputBox } from "@/components/toony-agents/task-input-box";
import type {
  TaskEventItem as TaskEventItemType,
  AgentTaskStatus,
} from "@/types";

interface TaskLiveOutputProps {
  prompt?: string;
  events: TaskEventItemType[];
  taskStatus: AgentTaskStatus;
  onAnswer: (questionId: string, answer: string) => void;
  onMessage: (text: string) => void;
  answeredSequences: Set<number>;
  canReply?: boolean;
  agentConnected?: boolean;
  projectId: string | null;
}

const INACTIVE_STATUSES: AgentTaskStatus[] = [
  "COMPLETED",
  "FAILED",
  "CANCELLED",
];

export function TaskLiveOutput({
  prompt,
  events,
  taskStatus,
  onAnswer,
  onMessage,
  answeredSequences,
  canReply,
  agentConnected = true,
  projectId,
}: TaskLiveOutputProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  const inputDisabled = !agentConnected || (INACTIVE_STATUSES.includes(taskStatus) && !canReply);

  return (
    <div className="flex flex-col h-full">
      {/* Scrollable events */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {prompt && (
          <div className="mb-3 flex justify-end">
            <div className="max-w-[80%] rounded-lg bg-indigo-500/15 px-3 py-2 text-sm text-slate-200">
              {prompt}
            </div>
          </div>
        )}
        {events.length === 0 ? (
          <p className="text-sm text-slate-500 italic">
            Waiting for events...
          </p>
        ) : (
          (() => {
            const toolResultMap = new Map<string, Record<string, unknown>>();
            const toolResultEventIds = new Set<string>();
            for (const ev of events) {
              if (ev.event_type === "TOOL_RESULT" && ev.data.tool_use_id) {
                toolResultMap.set(String(ev.data.tool_use_id), ev.data);
                toolResultEventIds.add(ev.id);
              }
            }

            return events
              .filter((ev) => !toolResultEventIds.has(ev.id))
              .map((event) => {
                const toolResult =
                  event.event_type === "TOOL_USE" && event.data.tool_use_id
                    ? toolResultMap.get(String(event.data.tool_use_id))
                    : undefined;

                return (
                  <TaskEventItem
                    key={event.id}
                    event={event}
                    toolResult={toolResult}
                    onAnswer={
                      event.event_type === "QUESTION_ASKED"
                        ? onAnswer
                        : undefined
                    }
                    onMessage={
                      event.event_type === "TOOL_APPROVAL"
                        ? onMessage
                        : undefined
                    }
                    isAnswered={
                      event.event_type === "QUESTION_ASKED"
                        ? answeredSequences.has(event.sequence)
                        : undefined
                    }
                    disabled={!agentConnected}
                  />
                );
              });
          })()
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input box */}
      <TaskInputBox
        onSend={onMessage}
        disabled={inputDisabled}
        projectId={projectId}
        placeholder={
          !agentConnected
            ? "Agent offline"
            : canReply
              ? "Reply to continue..."
              : undefined
        }
      />
    </div>
  );
}
