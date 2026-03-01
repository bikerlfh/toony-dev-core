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
              <h3 className="text-sm font-semibold text-gray-700">{col.label}</h3>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                {columnIssues.length}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-2">
              {columnIssues.length === 0 ? (
                <p className="py-8 text-center text-xs text-gray-400">No issues</p>
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
      className="cursor-pointer rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <span className="text-xs font-mono text-gray-400">{issue.identifier}</span>
        <PriorityBadge priority={issue.priority} />
      </div>
      <p className="mt-1 text-sm font-medium text-gray-900 line-clamp-2">{issue.title}</p>
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
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-[10px] font-medium text-gray-600" title={`${issue.assignee.first_name} ${issue.assignee.last_name}`}>
            {issue.assignee.first_name?.[0]}{issue.assignee.last_name?.[0]}
          </div>
        )}
      </div>
    </div>
  );
}
