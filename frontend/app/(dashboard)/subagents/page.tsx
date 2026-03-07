"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { listSubAgents, deleteSubAgent } from "@/lib/api/sub-agents";
import { ConfirmModal } from "@/components/confirm-modal";
import type { SubAgentList, SubAgentType, SubAgentStatus } from "@/types";

/* ── Status maps ──────────────────────────────────────── */

const STATUS_LABELS: Record<SubAgentStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  DEPRECATED: "Deprecated",
};

const STATUS_STYLES: Record<
  SubAgentStatus,
  { border: string; dot: string; text: string }
> = {
  DRAFT: {
    border: "border-l-slate-600",
    dot: "bg-slate-500",
    text: "text-slate-400",
  },
  ACTIVE: {
    border: "border-l-emerald-500",
    dot: "bg-emerald-400",
    text: "text-emerald-400",
  },
  INACTIVE: {
    border: "border-l-amber-500",
    dot: "bg-amber-400",
    text: "text-amber-400",
  },
  DEPRECATED: {
    border: "border-l-red-500",
    dot: "bg-red-400",
    text: "text-red-400",
  },
};

/* ── Agent type maps ─────────────────────────────────── */

const TYPE_LABELS: Record<SubAgentType, string> = {
  CODER: "Coder",
  REVIEWER: "Reviewer",
  TESTER: "Tester",
  PLANNER: "Planner",
  CUSTOM: "Custom",
};

const TYPE_ICONS: Record<SubAgentType, string> = {
  CODER: ">_",
  REVIEWER: "R",
  TESTER: "T",
  PLANNER: "P",
  CUSTOM: "*",
};

const TYPE_COLORS: Record<SubAgentType, string> = {
  CODER: "#818cf8",
  REVIEWER: "#f59e0b",
  TESTER: "#34d399",
  PLANNER: "#60a5fa",
  CUSTOM: "#94a3b8",
};

/* ── Filter options ──────────────────────────────────── */

const STATUS_OPTIONS: (SubAgentStatus | "ALL")[] = [
  "ALL",
  "ACTIVE",
  "DRAFT",
  "INACTIVE",
  "DEPRECATED",
];

const TYPE_OPTIONS: (SubAgentType | "ALL")[] = [
  "ALL",
  "CODER",
  "REVIEWER",
  "TESTER",
  "PLANNER",
  "CUSTOM",
];

/* ── Filter pill ─────────────────────────────────────── */

function FilterPill<T extends string>({
  value,
  label,
  active,
  dot,
  onClick,
}: {
  value: T;
  label: string;
  active: boolean;
  dot?: string;
  onClick: (v: T) => void;
}) {
  return (
    <button
      onClick={() => onClick(value)}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-slate-800 text-slate-200"
          : "text-slate-500 hover:text-slate-300"
      }`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      {label}
    </button>
  );
}

/* ── Page ─────────────────────────────────────────────── */

export default function SubAgentsPage() {
  const router = useRouter();
  const canManage = true;

  const [agents, setAgents] = useState<SubAgentList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<SubAgentList | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [statusFilter, setStatusFilter] = useState<SubAgentStatus | "ALL">(
    "ALL"
  );
  const [typeFilter, setTypeFilter] = useState<SubAgentType | "ALL">("ALL");

  const fetchAgents = useCallback(async () => {
    try {
      setAgents((await listSubAgents()).results);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  /* ── filtering ──────────────────────────────────────── */

  const filtered = useMemo(
    () =>
      agents.filter((a) => {
        if (statusFilter !== "ALL" && a.status !== statusFilter) return false;
        if (typeFilter !== "ALL" && a.agent_type !== typeFilter) return false;
        return true;
      }),
    [agents, statusFilter, typeFilter]
  );

  const hasFilters = statusFilter !== "ALL" || typeFilter !== "ALL";

  function clearFilters() {
    setStatusFilter("ALL");
    setTypeFilter("ALL");
  }

  /* ── delete ─────────────────────────────────────────── */

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteSubAgent(deleteTarget.slug);
      setDeleteTarget(null);
      fetchAgents();
    } finally {
      setIsDeleting(false);
    }
  }

  /* ── loading skeleton ───────────────────────────────── */

  if (isLoading) {
    return (
      <div>
        <div className="flex items-center justify-between">
          <div className="h-8 w-32 animate-pulse rounded-md bg-slate-800" />
          <div className="h-9 w-28 animate-pulse rounded-lg bg-slate-800" />
        </div>
        <div className="mt-5 flex gap-3">
          <div className="h-7 w-48 animate-pulse rounded-lg bg-slate-800" />
          <div className="h-7 w-56 animate-pulse rounded-lg bg-slate-800" />
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[130px] animate-pulse rounded-xl border border-slate-800/60 bg-slate-900"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ── Header ───────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium tracking-tight text-white">
          Sub-Agents
        </h1>
        {canManage && (
          <button
            onClick={() => router.push("/subagents/new")}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            Add sub-agent
          </button>
        )}
      </div>

      {/* ── Filters ──────────────────────────────────────── */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {/* Status pills */}
        <div className="flex items-center gap-0.5">
          <span className="mr-1 text-[10px] font-medium uppercase tracking-wider text-slate-600">
            Status
          </span>
          {STATUS_OPTIONS.map((s) => (
            <FilterPill
              key={s}
              value={s}
              label={s === "ALL" ? "All" : STATUS_LABELS[s]}
              active={statusFilter === s}
              dot={s !== "ALL" ? STATUS_STYLES[s].dot : undefined}
              onClick={(v) => setStatusFilter(v)}
            />
          ))}
        </div>

        <div className="h-4 w-px bg-slate-800" />

        {/* Type pills */}
        <div className="flex items-center gap-0.5">
          <span className="mr-1 text-[10px] font-medium uppercase tracking-wider text-slate-600">
            Type
          </span>
          {TYPE_OPTIONS.map((t) => (
            <FilterPill
              key={t}
              value={t}
              label={t === "ALL" ? "All" : TYPE_LABELS[t]}
              active={typeFilter === t}
              onClick={(v) => setTypeFilter(v)}
            />
          ))}
        </div>

        {/* Clear filters */}
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="ml-auto flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-slate-300"
          >
            <svg
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            Clear
          </button>
        )}
      </div>

      {/* ── Result count ─────────────────────────────────── */}
      <p className="mt-4 text-xs text-slate-600">
        {filtered.length} sub-agent{filtered.length !== 1 && "s"}
        {hasFilters && ` of ${agents.length}`}
      </p>

      {/* ── Grid ─────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="text-sm text-slate-500">
            {hasFilters
              ? "No sub-agents match these filters."
              : "No sub-agents configured."}
          </p>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="mt-2 text-sm text-indigo-400 transition-colors hover:text-indigo-300"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((agent) => {
            const ss = STATUS_STYLES[agent.status];
            const typeColor = TYPE_COLORS[agent.agent_type];
            return (
              <div
                key={agent.id}
                className={`group cursor-pointer rounded-xl border border-l-[3px] border-slate-800/60 ${ss.border} bg-slate-900 p-5 transition-all hover:border-slate-700/60`}
                onClick={() => router.push(`/subagents/${agent.id}/edit`)}
              >
                {/* Identity: icon + name + badges */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                      style={{
                        backgroundColor: `${typeColor}18`,
                        color: typeColor,
                      }}
                    >
                      {TYPE_ICONS[agent.agent_type]}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-[15px] font-semibold leading-tight text-white transition-colors group-hover:text-indigo-400">
                        {agent.name}
                      </h3>
                      <span className="mt-1 block text-xs text-slate-500">
                        {TYPE_LABELS[agent.agent_type]}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {agent.is_external && (
                      <span className="inline-flex rounded-full bg-purple-900/50 px-2 py-0.5 text-[10px] font-medium text-purple-400">
                        External
                      </span>
                    )}
                    {!agent.organization && (
                      <span className="inline-flex rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                        Global
                      </span>
                    )}
                  </div>
                </div>

                {/* Meta: status + version + actions */}
                <div className="mt-4 flex items-center justify-between border-t border-slate-800/40 pt-3">
                  <div className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${ss.dot}`} />
                    <span className={`text-xs font-medium ${ss.text}`}>
                      {STATUS_LABELS[agent.status]}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-slate-600">v{agent.version}</span>
                    {canManage && (
                      <>
                        <span className="text-slate-800">&middot;</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/subagents/${agent.id}/edit`);
                          }}
                          className="text-indigo-400 transition-colors hover:text-indigo-300"
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(agent);
                          }}
                          className="text-red-400 transition-colors hover:text-red-300"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete sub-agent"
          message={`Delete sub-agent "${deleteTarget.name}"? This will also remove all skill assignments.`}
          confirmLabel="Delete"
          confirmVariant="danger"
          isLoading={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
