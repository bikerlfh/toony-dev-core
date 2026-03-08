"use client";

import { useEffect, useRef } from "react";
import { TaskEventItem } from "@/components/toony-agents/task-event-item";
import { TaskInputBox } from "@/components/toony-agents/task-input-box";
import type {
  TaskEventItem as TaskEventItemType,
  AgentTaskStatus,
} from "@/types";

interface TaskLiveOutputProps {
  events: TaskEventItemType[];
  taskStatus: AgentTaskStatus;
  onAnswer: (questionId: string, answer: string) => void;
  onMessage: (text: string) => void;
  answeredSequences: Set<number>;
  canReply?: boolean;
}

const INACTIVE_STATUSES: AgentTaskStatus[] = [
  "COMPLETED",
  "FAILED",
  "CANCELLED",
];

export function TaskLiveOutput({
  events,
  taskStatus,
  onAnswer,
  onMessage,
  answeredSequences,
  canReply,
}: TaskLiveOutputProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  const inputDisabled = INACTIVE_STATUSES.includes(taskStatus) && !canReply;

  return (
    <div className="flex flex-col h-full">
      {/* Scrollable events */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {events.length === 0 ? (
          <p className="text-sm text-slate-500 italic">
            Waiting for events...
          </p>
        ) : (
          events.map((event) => (
            <TaskEventItem
              key={event.id}
              event={event}
              onAnswer={
                event.event_type === "QUESTION_ASKED"
                  ? onAnswer
                  : undefined
              }
              isAnswered={
                event.event_type === "QUESTION_ASKED"
                  ? answeredSequences.has(event.sequence)
                  : undefined
              }
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input box */}
      <TaskInputBox
        onSend={onMessage}
        disabled={inputDisabled}
        placeholder={canReply ? "Reply to continue..." : undefined}
      />
    </div>
  );
}
