"use client";

import { useMemo, useState } from "react";
import type {
  TaskEventItem,
  AgentTaskStatus,
} from "@/types";

interface PipelineStage {
  name: string;
  icon: string;
  startTime: string;
  eventCount: number;
  hasQuestion: boolean;
}

const EXPLORING_TOOLS = ["Read", "Grep", "Glob"];
const IMPLEMENTING_TOOLS = ["Edit", "Write"];

function classifyEvent(event: TaskEventItem): string | null {
  if (event.event_type === "QUESTION_ASKED") return "__GATE__";

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

  return null;
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
  collapsed: boolean;
  onToggle: () => void;
}

const TERMINAL_STATUSES: AgentTaskStatus[] = [
  "COMPLETED",
  "FAILED",
  "CANCELLED",
];

export function TaskPipelinePanel({
  events,
  taskStatus,
  collapsed,
  onToggle,
}: TaskPipelinePanelProps) {
  const stages = useMemo(() => {
    const result: PipelineStage[] = [];
    let currentStageName: string | null = null;

    for (const event of events) {
      const classification = classifyEvent(event);
      if (!classification) continue;

      if (classification === "__GATE__") {
        if (result.length > 0) {
          result[result.length - 1].hasQuestion = true;
        }
        continue;
      }

      if (classification !== currentStageName) {
        result.push({
          name: classification,
          icon: stageIcon(classification),
          startTime: event.created_at,
          eventCount: 1,
          hasQuestion: false,
        });
        currentStageName = classification;
      } else {
        result[result.length - 1].eventCount += 1;
      }
    }

    // Reverse so newest stage is at the top
    return result.reverse();
  }, [events]);

  const isTerminal = TERMINAL_STATUSES.includes(taskStatus);
  const totalStages = stages.length;

  function formatElapsed(startTime: string): string {
    const diff = Math.floor(
      (Date.now() - new Date(startTime).getTime()) / 1000
    );
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
    return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
  }

  return (
    <div className="h-full flex flex-col border-r border-slate-800 bg-slate-900/50">
      {/* Header — always visible */}
      <button
        onClick={onToggle}
        className="flex items-center justify-between px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-400 transition-colors flex-shrink-0"
      >
        <span>Pipeline {totalStages > 0 && `(${totalStages})`}</span>
        <svg
          className={`h-3.5 w-3.5 transition-transform ${collapsed ? "-rotate-90" : ""}`}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M3 4.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Collapsible body */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {stages.length === 0 ? (
            <p className="text-xs text-slate-600 italic">No stages yet</p>
          ) : (
            <div className="space-y-0">
              {stages.map((stage, idx) => {
                // After reversing: idx 0 is the newest (was last), idx last is the oldest (was first)
                const isNewest = idx === 0;
                const isActive = isNewest && !isTerminal;
                const isCompleted = !isNewest || isTerminal;

                return (
                  <div key={`${stage.name}-${idx}`} className="relative">
                    {/* Connecting line */}
                    {idx < stages.length - 1 && (
                      <div className="absolute left-[9px] top-[20px] w-px h-[calc(100%-4px)] bg-slate-700/60" />
                    )}

                    <div className="flex items-start gap-2.5 pb-4">
                      {/* Status indicator */}
                      <div className="flex-shrink-0 mt-0.5">
                        {isCompleted ? (
                          <div className="h-[18px] w-[18px] rounded-full bg-emerald-500/20 flex items-center justify-center">
                            <svg
                              className="h-2.5 w-2.5 text-emerald-400"
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
                          <div className="h-[18px] w-[18px] rounded-full bg-indigo-500/20 flex items-center justify-center">
                            <div className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
                          </div>
                        ) : (
                          <div className="h-[18px] w-[18px] rounded-full bg-slate-800 flex items-center justify-center">
                            <div className="h-1.5 w-1.5 rounded-full bg-slate-600" />
                          </div>
                        )}
                      </div>

                      {/* Stage info */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-xs">{stage.icon}</span>
                          <span
                            className={`text-xs font-medium ${
                              isActive ? "text-slate-200" : "text-slate-400"
                            }`}
                          >
                            {stage.name}
                          </span>
                          {stage.hasQuestion && (
                            <span className="text-[10px] text-indigo-400">Q</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
                          <span>{stage.eventCount} actions</span>
                          {isActive && (
                            <span className="text-indigo-400">
                              {formatElapsed(stage.startTime)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
