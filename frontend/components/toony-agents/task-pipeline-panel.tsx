"use client";

import { useMemo } from "react";
import type {
  TaskEventItem,
  AgentTaskStatus,
} from "@/types";

interface PipelineStage {
  name: string;
  icon: string;
  startTime: string;
  eventCount: number;
  hasApprovalGate: boolean;
}

const EXPLORING_TOOLS = ["Read", "Grep", "Glob"];
const IMPLEMENTING_TOOLS = ["Edit", "Write"];

function classifyEvent(event: TaskEventItem): string | null {
  if (event.event_type === "APPROVAL_NEEDED") return "__GATE__";

  if (event.event_type === "TOOL_USE") {
    const toolName = String(event.data.tool_name ?? "");

    if (EXPLORING_TOOLS.includes(toolName)) return "Exploring";
    if (IMPLEMENTING_TOOLS.includes(toolName)) return "Implementing";

    if (toolName === "Bash") {
      const command = String(event.data.command ?? "").toLowerCase();
      if (command.includes("test") || command.includes("pytest")) {
        return "Testing";
      }
    }

    return "Processing";
  }

  return null; // Non-tool events don't create new stages
}

function stageIcon(name: string): string {
  switch (name) {
    case "Exploring": return "\uD83D\uDD0D";
    case "Implementing": return "\u26A1";
    case "Testing": return "\uD83E\uDDEA";
    default: return "\u23F3";
  }
}

interface TaskPipelinePanelProps {
  events: TaskEventItem[];
  taskStatus: AgentTaskStatus;
}

const TERMINAL_STATUSES: AgentTaskStatus[] = [
  "COMPLETED",
  "FAILED",
  "CANCELLED",
];

export function TaskPipelinePanel({
  events,
  taskStatus,
}: TaskPipelinePanelProps) {
  const stages = useMemo(() => {
    const result: PipelineStage[] = [];
    let currentStageName: string | null = null;

    for (const event of events) {
      const classification = classifyEvent(event);
      if (!classification) continue;

      if (classification === "__GATE__") {
        // Mark the current stage as having an approval gate, or add one
        if (result.length > 0) {
          result[result.length - 1].hasApprovalGate = true;
        }
        continue;
      }

      if (classification !== currentStageName) {
        // New stage
        result.push({
          name: classification,
          icon: stageIcon(classification),
          startTime: event.created_at,
          eventCount: 1,
          hasApprovalGate: false,
        });
        currentStageName = classification;
      } else {
        // Same stage - increment
        result[result.length - 1].eventCount += 1;
      }
    }

    return result;
  }, [events]);

  const isTerminal = TERMINAL_STATUSES.includes(taskStatus);

  function formatElapsed(startTime: string): string {
    const diff = Math.floor(
      (Date.now() - new Date(startTime).getTime()) / 1000
    );
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
    return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
  }

  return (
    <div className="h-full overflow-y-auto border-r border-slate-800 bg-slate-900/50 px-4 py-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">
        Pipeline
      </h3>

      {stages.length === 0 ? (
        <p className="text-xs text-slate-600 italic">No stages yet</p>
      ) : (
        <div className="space-y-0">
          {stages.map((stage, idx) => {
            const isLast = idx === stages.length - 1;
            const isActive = isLast && !isTerminal;
            const isCompleted = !isLast || isTerminal;

            return (
              <div key={`${stage.name}-${idx}`} className="relative">
                {/* Connecting line */}
                {idx < stages.length - 1 && (
                  <div className="absolute left-[11px] top-[24px] w-px h-[calc(100%-8px)] bg-slate-700" />
                )}

                <div className="flex items-start gap-3 pb-6">
                  {/* Status indicator */}
                  <div className="flex-shrink-0 mt-0.5">
                    {isCompleted ? (
                      <div className="h-[22px] w-[22px] rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <svg
                          className="h-3 w-3 text-emerald-400"
                          viewBox="0 0 12 12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path
                            d="M2.5 6l2.5 2.5 4.5-5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    ) : isActive ? (
                      <div className="h-[22px] w-[22px] rounded-full bg-indigo-500/20 flex items-center justify-center">
                        <div className="h-2.5 w-2.5 rounded-full bg-indigo-400 animate-pulse" />
                      </div>
                    ) : (
                      <div className="h-[22px] w-[22px] rounded-full bg-slate-800 flex items-center justify-center">
                        <div className="h-2 w-2 rounded-full bg-slate-600" />
                      </div>
                    )}
                  </div>

                  {/* Stage info */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{stage.icon}</span>
                      <span
                        className={`text-sm font-medium ${
                          isActive ? "text-slate-200" : "text-slate-400"
                        }`}
                      >
                        {stage.name}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-600">
                      <span>{stage.eventCount} actions</span>
                      {isActive && (
                        <span className="text-indigo-400">
                          {formatElapsed(stage.startTime)}
                        </span>
                      )}
                    </div>
                    {stage.hasApprovalGate && (
                      <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
                        <span>Gate</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
