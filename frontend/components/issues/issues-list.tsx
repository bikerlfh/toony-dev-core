"use client";

import type { IssueList, IssueStatus, IssuePriority } from "@/types";
import { StatusBadge } from "@/components/status-badge";
import { PriorityBadge } from "@/components/priority-badge";

const ISSUE_STATUS_COLORS: Record<IssueStatus, string> = {
  BACKLOG: "bg-gray-100 text-gray-800",
  TODO: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  IN_REVIEW: "bg-purple-100 text-purple-800",
  DONE: "bg-green-100 text-green-800",
  CANCELED: "bg-red-100 text-red-800",
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
    return <p className="py-8 text-center text-gray-500">No issues found.</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">ID</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Title</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Priority</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Assignee</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Labels</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Due</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {issues.map((issue) => (
            <tr key={issue.id} className="cursor-pointer hover:bg-gray-50" onClick={() => onIssueClick(issue)}>
              <td className="whitespace-nowrap px-4 py-3">
                <span className="text-xs font-mono text-gray-500">{issue.identifier}</span>
              </td>
              <td className="max-w-xs truncate px-4 py-3 text-sm font-medium text-gray-900">
                {issue.title}
              </td>
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                {onStatusChange ? (
                  <select
                    value={issue.status}
                    onChange={(e) => onStatusChange(issue, e.target.value as IssueStatus)}
                    className="rounded border border-gray-300 px-1.5 py-0.5 text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{ISSUE_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                ) : (
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ISSUE_STATUS_COLORS[issue.status]}`}>
                    {ISSUE_STATUS_LABELS[issue.status]}
                  </span>
                )}
              </td>
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                {onPriorityChange ? (
                  <select
                    value={issue.priority}
                    onChange={(e) => onPriorityChange(issue, e.target.value as IssuePriority)}
                    className="rounded border border-gray-300 px-1.5 py-0.5 text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  >
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                ) : (
                  <PriorityBadge priority={issue.priority} />
                )}
              </td>
              <td className="px-4 py-3 text-sm text-gray-500">
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
                    <span className="text-[10px] text-gray-400">+{issue.labels.length - 2}</span>
                  )}
                </div>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                {issue.due_date ? new Date(issue.due_date).toLocaleDateString() : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
