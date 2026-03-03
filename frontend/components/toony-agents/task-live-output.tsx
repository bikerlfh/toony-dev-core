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
  onApprove: (sequence: number) => void;
  onReject: (sequence: number) => void;
  onMessage: (text: string) => void;
  approvedSequences: Set<number>;
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
  onApprove,
  onReject,
  onMessage,
  approvedSequences,
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
              onApprove={
                event.event_type === "APPROVAL_NEEDED"
                  ? () => onApprove(event.sequence)
                  : undefined
              }
              onReject={
                event.event_type === "APPROVAL_NEEDED"
                  ? () => onReject(event.sequence)
                  : undefined
              }
              onMessage={
                event.event_type === "APPROVAL_NEEDED"
                  ? onMessage
                  : undefined
              }
              isApprovalResolved={
                event.event_type === "APPROVAL_NEEDED"
                  ? approvedSequences.has(event.sequence)
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
