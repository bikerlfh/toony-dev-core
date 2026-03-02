"use client";

import type { IssueList, IssueStatus, IssuePriority } from "@/types";
import { StatusBadge } from "@/components/status-badge";
import { PriorityBadge } from "@/components/priority-badge";
import { Select } from "@/components/ui/select";

const ISSUE_STATUS_COLORS: Record<IssueStatus, string> = {
  BACKLOG: "bg-slate-800 text-slate-400",
  TODO: "bg-blue-500/15 text-blue-400",
  IN_PROGRESS: "bg-amber-500/15 text-amber-400",
  IN_REVIEW: "bg-purple-500/15 text-purple-400",
  DONE: "bg-emerald-500/15 text-emerald-400",
  CANCELED: "bg-red-500/15 text-red-400",
};

const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  BACKLOG: "Backlog",
  TODO: "Todo",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
  DONE: "Done",
  CANCELED: "Canceled",
};

interface IssuesListProps {
  issues: IssueList[];
  onIssueClick: (issue: IssueList) => void;
  onStatusChange?: (issue: IssueList, status: IssueStatus) => void;
  onPriorityChange?: (issue: IssueList, priority: IssuePriority) => void;
}

const STATUS_OPTIONS: IssueStatus[] = ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELED"];
const PRIORITY_OPTIONS: IssuePriority[] = ["NONE", "URGENT", "HIGH", "MEDIUM", "LOW"];

export function IssuesList({ issues, onIssueClick, onStatusChange, onPriorityChange }: IssuesListProps) {
  if (issues.length === 0) {
    return <p className="py-8 text-center text-slate-500">No issues found.</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800/60">
      <table className="min-w-full divide-y divide-slate-800/60">
        <thead className="bg-slate-900">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">ID</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Title</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Priority</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Assignee</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Labels</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Due</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {issues.map((issue) => (
            <tr key={issue.id} className="cursor-pointer hover:bg-slate-900/60" onClick={() => onIssueClick(issue)}>
              <td className="whitespace-nowrap px-4 py-3">
                <span className="text-xs font-mono text-slate-500">{issue.identifier}</span>
              </td>
              <td className="max-w-xs truncate px-4 py-3 text-sm font-medium text-slate-200">
                {issue.title}
              </td>
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                {onStatusChange ? (
                  <Select
                    options={STATUS_OPTIONS.map((s) => ({ value: s, label: ISSUE_STATUS_LABELS[s] }))}
                    value={issue.status}
                    onChange={(v) => onStatusChange(issue, v as IssueStatus)}
                    size="sm"
                  />
                ) : (
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ISSUE_STATUS_COLORS[issue.status]}`}>
                    {ISSUE_STATUS_LABELS[issue.status]}
                  </span>
                )}
              </td>
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                {onPriorityChange ? (
                  <Select
                    options={PRIORITY_OPTIONS.map((p) => ({ value: p, label: p }))}
                    value={issue.priority}
                    onChange={(v) => onPriorityChange(issue, v as IssuePriority)}
                    size="sm"
                  />
                ) : (
                  <PriorityBadge priority={issue.priority} />
                )}
              </td>
              <td className="px-4 py-3 text-sm text-slate-500">
                {issue.assignee
                  ? `${issue.assignee.first_name} ${issue.assignee.last_name}`
                  : "—"}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {issue.labels.slice(0, 2).map((l) => (
                    <span
                      key={l.id}
                      className="inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
                      style={{ backgroundColor: l.color }}
                    >
                      {l.name}
                    </span>
                  ))}
                  {issue.labels.length > 2 && (
                    <span className="text-[10px] text-slate-500">+{issue.labels.length - 2}</span>
                  )}
                </div>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                {issue.due_date ? new Date(issue.due_date).toLocaleDateString() : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
