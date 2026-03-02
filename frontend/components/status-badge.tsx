import type { ProjectStatus, MilestoneStatus, CycleStatus } from "@/types";

const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  BACKLOG: "bg-slate-800 text-slate-400",
  PLANNED: "bg-blue-500/15 text-blue-400",
  IN_PROGRESS: "bg-amber-500/15 text-amber-400",
  PAUSED: "bg-orange-500/15 text-orange-400",
  COMPLETED: "bg-emerald-500/15 text-emerald-400",
  CANCELED: "bg-red-500/15 text-red-400",
};

const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  BACKLOG: "Backlog",
  PLANNED: "Planned",
  IN_PROGRESS: "In Progress",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  CANCELED: "Canceled",
};

const MILESTONE_STATUS_COLORS: Record<MilestoneStatus, string> = {
  PLANNED: "bg-blue-500/15 text-blue-400",
  IN_PROGRESS: "bg-amber-500/15 text-amber-400",
  COMPLETED: "bg-emerald-500/15 text-emerald-400",
};

const CYCLE_STATUS_COLORS: Record<CycleStatus, string> = {
  PLANNED: "bg-blue-500/15 text-blue-400",
  ACTIVE: "bg-amber-500/15 text-amber-400",
  COMPLETED: "bg-emerald-500/15 text-emerald-400",
};

type StatusType = ProjectStatus | MilestoneStatus | CycleStatus;

interface StatusBadgeProps {
  status: StatusType;
  type?: "project" | "milestone" | "cycle";
}

export function StatusBadge({ status, type = "project" }: StatusBadgeProps) {
  let colorClass: string;

  if (type === "milestone") {
    colorClass = MILESTONE_STATUS_COLORS[status as MilestoneStatus] || "bg-slate-800 text-slate-400";
  } else if (type === "cycle") {
    colorClass = CYCLE_STATUS_COLORS[status as CycleStatus] || "bg-slate-800 text-slate-400";
  } else {
    colorClass = PROJECT_STATUS_COLORS[status as ProjectStatus] || "bg-slate-800 text-slate-400";
  }

  const label = PROJECT_STATUS_LABELS[status as ProjectStatus] || status;

  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}
    >
      {label}
    </span>
  );
}
