import type { ProjectPriority } from "@/types";

const PRIORITY_STYLES: Record<ProjectPriority, string> = {
  NONE: "bg-slate-800 text-slate-500",
  URGENT: "bg-red-500/15 text-red-400",
  HIGH: "bg-orange-500/15 text-orange-400",
  MEDIUM: "bg-amber-500/15 text-amber-400",
  LOW: "bg-blue-500/15 text-blue-400",
};

const PRIORITY_LABELS: Record<ProjectPriority, string> = {
  NONE: "None",
  URGENT: "Urgent",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

interface PriorityBadgeProps {
  priority: ProjectPriority;
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  if (priority === "NONE") return null;

  return (
    <span
      className={`inline-block rounded-full px-1.5 py-px text-[10px] font-medium leading-normal ${PRIORITY_STYLES[priority]}`}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  );
}
