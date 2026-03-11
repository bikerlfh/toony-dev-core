"use client";

import { useState, useCallback, useRef } from "react";
import type { DragEvent } from "react";
import type { CrossProjectIssueList, IssueStatus } from "@/types";
import { PriorityBadge } from "@/components/priority-badge";

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
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
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

      {/* Bottom row: labels + assignee */}
      <div className="mt-2.5 flex items-center justify-between">
        <div className="flex flex-wrap gap-1">
          {issue.labels.slice(0, 3).map((label) => (
            <span
              key={label.id}
              className="inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: label.color }}
            >
              {label.name}
            </span>
          ))}
        </div>
        {issue.assignee && (
          <div
            className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-[10px] font-medium text-slate-400"
            title={`${issue.assignee.first_name} ${issue.assignee.last_name}`}
          >
            {issue.assignee.first_name?.[0]}{issue.assignee.last_name?.[0]}
          </div>
        )}
      </div>
    </div>
  );
}
