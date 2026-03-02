"use client";

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
}

export function KanbanBoard({ issues, onIssueClick }: KanbanBoardProps) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {COLUMNS.map((col) => {
        const columnIssues = issues.filter((i) => i.status === col.status);
        return (
          <div key={col.status} className="flex w-72 shrink-0 flex-col">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-300">{col.label}</h3>
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-500">
                {columnIssues.length}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-2">
              {columnIssues.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-600">No issues</p>
              ) : (
                columnIssues.map((issue) => (
                  <IssueCard key={issue.id} issue={issue} onClick={() => onIssueClick(issue)} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IssueCard({ issue, onClick }: { issue: IssueList; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="cursor-pointer rounded-xl border border-slate-800/60 bg-slate-900 p-3 transition-colors hover:bg-slate-900/80"
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
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-[10px] font-medium text-slate-400" title={`${issue.assignee.first_name} ${issue.assignee.last_name}`}>
            {issue.assignee.first_name?.[0]}{issue.assignee.last_name?.[0]}
          </div>
        )}
      </div>
    </div>
  );
}
