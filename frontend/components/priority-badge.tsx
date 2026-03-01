import type { ProjectPriority } from "@/types";

const PRIORITY_COLORS: Record<ProjectPriority, string> = {
  NONE: "bg-gray-100 text-gray-600",
  URGENT: "bg-red-100 text-red-800",
  HIGH: "bg-orange-100 text-orange-800",
  MEDIUM: "bg-yellow-100 text-yellow-800",
  LOW: "bg-blue-100 text-blue-800",
};

interface PriorityBadgeProps {
  priority: ProjectPriority;
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  if (priority === "NONE") return null;

  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_COLORS[priority]}`}
    >
      {priority}
    </span>
  );
}
