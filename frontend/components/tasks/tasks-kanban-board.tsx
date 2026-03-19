"use client";

import { useState, useCallback, useRef } from "react";
import type { DragEvent } from "react";
import Link from "next/link";
import type { CrossProjectIssueList, IssueStatus } from "@/types";
import type { AgentTaskStatus } from "@/types/toony-agents";
import { PriorityBadge } from "@/components/priority-badge";

const AGENT_TASK_STATUS_CONFIG: Record<AgentTaskStatus, { color: string; label: string; animate?: string }> = {
  QUEUED: { color: "text-slate-400", label: "Queued" },
  PAUSED: { color: "text-slate-400", label: "Paused" },
  ASSIGNED: { color: "text-blue-400", label: "Assigned" },
  RUNNING: { color: "text-amber-400", label: "Running", animate: "animate-blink" },
  WAITING_FOR_ANSWER: { color: "text-purple-400", label: "Waiting for Answer" },
  COMPLETED: { color: "text-emerald-400", label: "Completed" },
  FAILED: { color: "text-red-400", label: "Failed" },
  CANCELLED: { color: "text-slate-400", label: "Cancelled" },
};

const COLUMNS: { status: IssueStatus; label: string }[] = [
  { status: "BACKLOG", label: "Backlog" },
  { status: "TODO", label: "Todo" },
  { status: "IN_PROGRESS", label: "In Progress" },
  { status: "IN_REVIEW", label: "In Review" },
  { status: "DONE", label: "Done" },
  { status: "CANCELED", label: "Canceled" },
];

interface TasksKanbanBoardProps {
  issues: CrossProjectIssueList[];
  onIssueClick: (issue: CrossProjectIssueList) => void;
  onStatusChange?: (issue: CrossProjectIssueList, newStatus: IssueStatus) => void;
}

export function TasksKanbanBoard({ issues, onIssueClick, onStatusChange }: TasksKanbanBoardProps) {
  const [dragOverColumn, setDragOverColumn] = useState<IssueStatus | null>(null);
  const [draggingIssueId, setDraggingIssueId] = useState<string | null>(null);
  const lastDragOverRef = useRef<IssueStatus | null>(null);

  const handleDragStart = useCallback((e: DragEvent<HTMLDivElement>, issue: CrossProjectIssueList) => {
    e.dataTransfer.setData("text/plain", issue.id);
    e.dataTransfer.effectAllowed = "move";
    requestAnimationFrame(() => {
      setDraggingIssueId(issue.id);
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingIssueId(null);
    setDragOverColumn(null);
    lastDragOverRef.current = null;
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>, status: IssueStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (lastDragOverRef.current !== status) {
      lastDragOverRef.current = status;
      setDragOverColumn(status);
    }
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>, targetStatus: IssueStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    setDraggingIssueId(null);
    lastDragOverRef.current = null;

    if (!onStatusChange) return;

    const issueId = e.dataTransfer.getData("text/plain");
    const issue = issues.find((i) => i.id === issueId);
    if (issue && issue.status !== targetStatus) {
      onStatusChange(issue, targetStatus);
    }
  }, [issues, onStatusChange]);

  const isDragging = draggingIssueId !== null;

  const ALWAYS_VISIBLE: Set<IssueStatus> = new Set(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"]);
  const visibleColumns = COLUMNS.filter((col) => ALWAYS_VISIBLE.has(col.status) || issues.some((i) => i.status === col.status));

  return (
    <div className="min-w-0 flex-1 overflow-x-auto pb-4">
      <div className="flex gap-2.5">
        {visibleColumns.map((col) => {
            const columnIssues = issues.filter((i) => i.status === col.status);
            const isOver = dragOverColumn === col.status && isDragging;

            return (
              <div
                key={col.status}
                className={`flex w-80 shrink-0 flex-col rounded-xl p-1.5 transition-colors duration-150 ${
                  isOver
                    ? "bg-indigo-500/[0.06] ring-1 ring-inset ring-indigo-500/20"
                    : ""
                }`}
                onDragOver={(e) => handleDragOver(e, col.status)}
                onDrop={(e) => handleDrop(e, col.status)}
              >
                <div className="mb-2 flex items-center justify-between px-0.5">
                  <h3 className="text-sm font-medium text-slate-300">{col.label}</h3>
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-500">
                    {columnIssues.length}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-1 min-h-[4rem]">
                  {columnIssues.map((issue) => (
                    <IssueCard
                      key={issue.id}
                      issue={issue}
                      isDragging={draggingIssueId === issue.id}
                      draggable={!!onStatusChange}
                      onClick={() => onIssueClick(issue)}
                      onDragStart={(e) => handleDragStart(e, issue)}
                      onDragEnd={handleDragEnd}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
    </div>
  );
}

function IssueCard({
  issue,
  isDragging,
  draggable,
  onClick,
  onDragStart,
  onDragEnd,
}: {
  issue: CrossProjectIssueList;
  isDragging: boolean;
  draggable: boolean;
  onClick: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable={draggable}
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`rounded-xl border border-slate-800/60 bg-slate-900 p-3.5 transition-all hover:bg-slate-900/80 ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      } ${isDragging ? "opacity-30 scale-[0.97]" : ""}`}
    >
      {/* Top row: project dot + identifier + milestone/cycle + priority */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          {issue.project?.color && (
            <span
              className="inline-block h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: issue.project.color }}
              title={issue.project.name}
            />
          )}
          <span className="text-xs font-mono text-slate-500 shrink-0">{issue.identifier}</span>
          {(issue.milestone || issue.cycle) && (
            <>
              <span className="text-slate-700 text-[10px] shrink-0">/</span>
              {issue.milestone && (
                <span className="text-[10px] font-mono text-slate-600 truncate" title={issue.milestone.name}>{issue.milestone.name}</span>
              )}
              {issue.milestone && issue.cycle && (
                <span className="text-slate-700 text-[10px] shrink-0">/</span>
              )}
              {issue.cycle && (
                <span className="text-[10px] font-mono text-slate-600 truncate" title={issue.cycle.name}>{issue.cycle.name}</span>
              )}
            </>
          )}
        </div>
        <PriorityBadge priority={issue.priority} />
      </div>

      {/* Title — single line */}
      <p className="mt-1.5 text-sm font-medium text-slate-200 line-clamp-1">{issue.title}</p>

      {/* Description — up to 3 lines */}
      {issue.description && (
        <p className="mt-1 text-xs leading-relaxed text-slate-500 line-clamp-3">{issue.description}</p>
      )}

      {/* Agent task status row */}
      {issue.latest_agent_task_status && (() => {
        const cfg = AGENT_TASK_STATUS_CONFIG[issue.latest_agent_task_status];
        return (
          <div className={`mt-2 flex items-center gap-1.5 ${cfg.color} ${cfg.animate ?? ""}`}>
            <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z" />
            </svg>
            <span className="text-[11px] font-medium">{cfg.label}</span>
          </div>
        );
      })()}

      {/* Bottom row: project + labels + assignee */}
      <div className="mt-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          {issue.project && (
            <Link
              href={`/projects/${issue.project_id}`}
              onClick={(e) => e.stopPropagation()}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-slate-800/80 px-2 py-0.5 text-[11px] text-slate-400 transition-colors duration-150 hover:text-slate-200"
            >
              {issue.project.icon && <span className="text-[11px] leading-none">{issue.project.icon}</span>}
              <span className="font-medium truncate max-w-[7rem]">{issue.project.name}</span>
            </Link>
          )}
          {issue.labels.slice(0, 3).map((label) => (
            <span
              key={label.id}
              className="flex shrink-0 items-center gap-1 rounded-full bg-slate-800/80 px-2 py-0.5 text-[11px] font-medium text-slate-400"
            >
              <span
                className="inline-block h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: label.color }}
              />
              {label.name}
            </span>
          ))}
        </div>
        {issue.assignee && (
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-medium text-slate-400"
            title={`${issue.assignee.first_name} ${issue.assignee.last_name}`}
          >
            {issue.assignee.first_name?.[0]}{issue.assignee.last_name?.[0]}
          </div>
        )}
      </div>
    </div>
  );
}
