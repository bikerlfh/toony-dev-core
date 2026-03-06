"use client";

import type { ArtifactType } from "@/types/artifacts";

const TYPE_STYLES: Record<ArtifactType, string> = {
  PLAN: "bg-indigo-500/15 text-indigo-400",
  DESIGN_DOC: "bg-purple-500/15 text-purple-400",
  TECHNICAL_SPEC: "bg-cyan-500/15 text-cyan-400",
  TEST_PLAN: "bg-emerald-500/15 text-emerald-400",
  OTHER: "bg-slate-500/15 text-slate-400",
};

const TYPE_LABELS: Record<ArtifactType, string> = {
  PLAN: "Plan",
  DESIGN_DOC: "Design Doc",
  TECHNICAL_SPEC: "Technical Spec",
  TEST_PLAN: "Test Plan",
  OTHER: "Other",
};

export function ArtifactTypeBadge({ type }: { type: ArtifactType }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_STYLES[type]}`}
    >
      {TYPE_LABELS[type]}
    </span>
  );
}
