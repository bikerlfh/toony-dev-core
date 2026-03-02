"use client";

import { useState, useCallback, useRef } from "react";
import type { DragEvent } from "react";
import type { IssueList, IssueStatus } from "@/types";
import { PriorityBadge } from "@/components/priority-badge";

const COLUMNS: { status: IssueStatus; label: string }[] = [
  { status: "BACKLOG", label: "Backlog" },
  { status: "TODO", label: "Todo" },
  { status: "IN_PROGRESS", label: "In Progress" },
  { status: "IN_REVIEW", label: "In Review" },
  { status: "DONE", label: "Done" },
  { status: "CANCELED", label: "Canceled" },
];

interface KanbanBoardProps {
  issues: IssueList[];
  onIssueClick: (issue: IssueList) => void;
  onStatusChange?: (issue: IssueList, newStatus: IssueStatus) => void;
}

export function KanbanBoard({ issues, onIssueClick, onStatusChange }: KanbanBoardProps) {
  const [dragOverColumn, setDragOverColumn] = useState<IssueStatus | null>(null);
  const [draggingIssueId, setDraggingIssueId] = useState<string | null>(null);
  const lastDragOverRef = useRef<IssueStatus | null>(null);

  const handleDragStart = useCallback((e: DragEvent<HTMLDivElement>, issue: IssueList) => {
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

  const populatedColumns = COLUMNS.filter((col) => issues.some((i) => i.status === col.status));
  const emptyColumns = COLUMNS.filter((col) => !issues.some((i) => i.status === col.status));

  return (
    <div className="flex gap-4">
      <div className="min-w-0 flex-1 overflow-x-auto pb-4">
        <div className="flex gap-4">
          {populatedColumns.map((col) => {
            const columnIssues = issues.filter((i) => i.status === col.status);
            const isOver = dragOverColumn === col.status && isDragging;

            return (
              <div
                key={col.status}
                className={`flex w-72 shrink-0 flex-col rounded-xl p-1.5 transition-colors duration-150 ${
                  isOver
                    ? "bg-indigo-500/[0.06] ring-1 ring-inset ring-indigo-500/20"
                    : ""
                }`}
                onDragOver={(e) => handleDragOver(e, col.status)}
                onDrop={(e) => handleDrop(e, col.status)}
              >
                <div className="mb-3 flex items-center justify-between px-0.5">
                  <h3 className="text-sm font-medium text-slate-300">{col.label}</h3>
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-500">
                    {columnIssues.length}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-2 min-h-[4rem]">
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
      {emptyColumns.length > 0 && (
        <div className="w-48 shrink-0 self-start rounded-xl border border-slate-800/40 bg-slate-900/50 p-3">
          <h4 className="mb-2 text-xs font-medium text-slate-500">Empty statuses</h4>
          <div className="flex flex-col gap-1.5">
            {emptyColumns.map((col) => {
              const isOver = dragOverColumn === col.status && isDragging;

              return (
                <div
                  key={col.status}
                  className={`rounded-lg border border-dashed px-3 py-2 text-xs transition-colors duration-150 ${
                    isOver
                      ? "border-indigo-500/40 bg-indigo-500/[0.06] text-indigo-400"
                      : isDragging
                        ? "border-slate-700/50 text-slate-400"
                        : "border-slate-800/40 text-slate-500"
                  }`}
                  onDragOver={(e) => handleDragOver(e, col.status)}
                  onDrop={(e) => handleDrop(e, col.status)}
                >
                  {col.label}
                </div>
              );
            })}
          </div>
        </div>
      )}
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
  issue: IssueList;
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
      className={`rounded-xl border border-slate-800/60 bg-slate-900 p-3 transition-all hover:bg-slate-900/80 ${
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      } ${isDragging ? "opacity-30 scale-[0.97]" : ""}`}
    >
      <div className="flex items-start justify-between">
        <span className="text-xs font-mono text-slate-500">{issue.identifier}</span>
        <PriorityBadge priority={issue.priority} />
      </div>
      <p className="mt-1 text-sm font-medium text-slate-200 line-clamp-2">{issue.title}</p>
      <div className="mt-2 flex items-center justify-between">
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
