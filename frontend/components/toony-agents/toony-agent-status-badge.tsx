"use client";

import type { ToonyAgentStatus } from "@/types";

const STATUS_CONFIG: Record<ToonyAgentStatus, { label: string; className: string }> = {
  OFFLINE: { label: "Offline", className: "bg-slate-500/15 text-slate-400" },
  ONLINE: { label: "Online", className: "bg-emerald-500/15 text-emerald-400" },
  BUSY: { label: "Busy", className: "bg-blue-500/15 text-blue-400" },
};

export function ToonyAgentStatusBadge({ status }: { status: ToonyAgentStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
