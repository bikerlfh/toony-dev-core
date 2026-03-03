"use client";

import { useState } from "react";
import { ApprovalGateCard } from "@/components/toony-agents/approval-gate-card";
import type { TaskEventItem as TaskEventItemType } from "@/types";

interface TaskEventItemProps {
  event: TaskEventItemType;
  onApprove?: () => void;
  onReject?: () => void;
  onMessage?: (text: string) => void;
  isApprovalResolved?: boolean;
}

export function TaskEventItem({
  event,
  onApprove,
  onReject,
  onMessage,
  isApprovalResolved,
}: TaskEventItemProps) {
  const [showToolResult, setShowToolResult] = useState(false);

  switch (event.event_type) {
    case "LOG":
      return (
        <div className="py-0.5">
          <span className="text-slate-400 font-mono text-sm">
            {String(event.data.message ?? event.data.text ?? "")}
          </span>
        </div>
      );

    case "TOOL_USE":
      return (
        <div className="py-0.5">
          <span className="text-indigo-400 font-mono text-sm">
            {"▸ "}
            {String(event.data.tool_name ?? "")}
            {event.data.file_path ? ` ${String(event.data.file_path)}` : ""}
          </span>
        </div>
      );

    case "TOOL_RESULT": {
      const resultText = String(event.data.result ?? event.data.output ?? "");
      return (
        <div className="py-0.5">
          <button
            onClick={() => setShowToolResult((v) => !v)}
            className="text-slate-500 font-mono text-sm hover:text-slate-300 transition-colors"
          >
            {showToolResult ? "▾ Hide result" : "▸ Show result"}
          </button>
          {showToolResult && (
            <pre className="mt-1 ml-4 max-h-60 overflow-auto rounded border border-slate-800 bg-slate-950 p-2 text-xs text-slate-400 font-mono whitespace-pre-wrap">
              {resultText}
            </pre>
          )}
        </div>
      );
    }

    case "ERROR":
      return (
        <div className="py-0.5">
          <span className="text-red-400 font-mono text-sm">
            {String(event.data.message ?? event.data.error ?? "")}
          </span>
        </div>
      );

    case "STATUS_CHANGE":
      return (
        <div className="py-1">
          <span className="text-slate-500 text-xs italic">
            Status: {String(event.data.old_status ?? "?")} &rarr;{" "}
            {String(event.data.new_status ?? "?")}
          </span>
        </div>
      );

    case "APPROVAL_NEEDED": {
      const data = event.data as {
        question?: string;
        options?: { label: string; description: string }[];
      };
      return (
        <div className="py-2">
          <ApprovalGateCard
            question={String(data.question ?? "Approval required")}
            options={data.options}
            onApprove={onApprove ?? (() => {})}
            onReject={onReject ?? (() => {})}
            onMessage={onMessage ?? (() => {})}
            isResolved={isApprovalResolved ?? false}
          />
        </div>
      );
    }

    case "APPROVAL_RESPONSE":
      return (
        <div className="py-1">
          <span className="text-slate-400 text-sm">
            User responded:{" "}
            <span className="font-medium text-slate-200">
              {String(event.data.action ?? "")}
            </span>
            {event.data.response
              ? ` — "${String(event.data.response)}"`
              : ""}
          </span>
        </div>
      );

    case "REPLY":
      return (
        <div className="py-1 flex justify-end">
          <div className="rounded-lg bg-indigo-600/20 border border-indigo-500/30 px-3 py-2 max-w-[80%]">
            <span className="text-sm text-indigo-200">
              {String(event.data.message ?? "")}
            </span>
          </div>
        </div>
      );

    default:
      return (
        <div className="py-0.5">
          <span className="text-slate-500 font-mono text-xs">
            [{event.event_type}] {JSON.stringify(event.data)}
          </span>
        </div>
      );
  }
}
