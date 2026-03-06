"use client";

import type { ArtifactStatus } from "@/types/artifacts";

const STATUS_STYLES: Record<ArtifactStatus, string> = {
  DRAFT: "bg-slate-500/15 text-slate-400",
  PENDING_APPROVAL: "bg-amber-500/15 text-amber-400",
  IN_REVIEW: "bg-blue-500/15 text-blue-400",
  APPROVED: "bg-emerald-500/15 text-emerald-400",
  REJECTED: "bg-red-500/15 text-red-400",
  REVISION_REQUESTED: "bg-orange-500/15 text-orange-400",
  SUPERSEDED: "bg-slate-500/15 text-slate-500",
};

const STATUS_LABELS: Record<ArtifactStatus, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending Approval",
  IN_REVIEW: "In Review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  REVISION_REQUESTED: "Revision Requested",
  SUPERSEDED: "Superseded",
};

export function ArtifactStatusBadge({ status }: { status: ArtifactStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
