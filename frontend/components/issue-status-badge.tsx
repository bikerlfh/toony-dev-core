import type { IssueStatus } from "@/types";

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

export function IssueStatusBadge({ status }: { status: IssueStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ISSUE_STATUS_COLORS[status]}`}
    >
      {ISSUE_STATUS_LABELS[status]}
    </span>
  );
}
