import type { ProjectStatus, MilestoneStatus, CycleStatus } from "@/types";

const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  BACKLOG: "bg-gray-100 text-gray-800",
  PLANNED: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  PAUSED: "bg-orange-100 text-orange-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELED: "bg-red-100 text-red-800",
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
  PLANNED: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  COMPLETED: "bg-green-100 text-green-800",
};

const CYCLE_STATUS_COLORS: Record<CycleStatus, string> = {
  PLANNED: "bg-blue-100 text-blue-800",
  ACTIVE: "bg-yellow-100 text-yellow-800",
  COMPLETED: "bg-green-100 text-green-800",
};

type StatusType = ProjectStatus | MilestoneStatus | CycleStatus;

interface StatusBadgeProps {
  status: StatusType;
  type?: "project" | "milestone" | "cycle";
}

export function StatusBadge({ status, type = "project" }: StatusBadgeProps) {
  let colorClass: string;

  if (type === "milestone") {
    colorClass = MILESTONE_STATUS_COLORS[status as MilestoneStatus] || "bg-gray-100 text-gray-800";
  } else if (type === "cycle") {
    colorClass = CYCLE_STATUS_COLORS[status as CycleStatus] || "bg-gray-100 text-gray-800";
  } else {
    colorClass = PROJECT_STATUS_COLORS[status as ProjectStatus] || "bg-gray-100 text-gray-800";
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
