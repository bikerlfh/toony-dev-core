"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { listWorkflows } from "@/lib/api/workflows";
import type { WorkflowList } from "@/types";

/* ── Scope helpers ─────────────────────────────────── */

type ScopeKind = "GLOBAL" | "ORGANIZATION" | "PROJECT";

function getScope(w: WorkflowList): ScopeKind {
  if (w.project) return "PROJECT";
  if (w.organization) return "ORGANIZATION";
  return "GLOBAL";
}

const SCOPE_LABELS: Record<ScopeKind, string> = {
  GLOBAL: "Global",
  ORGANIZATION: "Organization",
  PROJECT: "Project",
};

/* ── Context path builder ─────────────────────────── */

function getContextPath(w: WorkflowList): string[] {
  const parts: string[] = [];
  if (w.organization) parts.push(w.organization.name);
  if (w.project) parts.push(w.project.name);
  if (parts.length === 0) parts.push("global");
  return parts;
}

/* ── Filter options ────────────────────────────────── */

type ActiveFilter = "ALL" | "ACTIVE" | "INACTIVE";
type ScopeFilter = "ALL" | ScopeKind;

const ACTIVE_OPTIONS: ActiveFilter[] = ["ALL", "ACTIVE", "INACTIVE"];
const SCOPE_OPTIONS: ScopeFilter[] = [
  "ALL",
  "GLOBAL",
  "ORGANIZATION",
  "PROJECT",
];

/* ── Filter pill ───────────────────────────────────── */

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

/* ── Page ──────────────────────────────────────────── */

export default function WorkflowsPage() {
  const router = useRouter();

  const [workflows, setWorkflows] = useState<WorkflowList[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("ALL");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("ALL");

  const fetchWorkflows = useCallback(async () => {
    try {
      setWorkflows((await listWorkflows()).results);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  /* ── filtering ──────────────────────────────────── */

  const filtered = useMemo(
    () =>
      workflows.filter((w) => {
        if (activeFilter === "ACTIVE" && !w.is_active) return false;
        if (activeFilter === "INACTIVE" && w.is_active) return false;
        if (scopeFilter !== "ALL" && getScope(w) !== scopeFilter) return false;
        return true;
      }),
    [workflows, activeFilter, scopeFilter]
  );

  const hasFilters = activeFilter !== "ALL" || scopeFilter !== "ALL";

  function clearFilters() {
    setActiveFilter("ALL");
    setScopeFilter("ALL");
  }

  /* ── loading skeleton ──────────────────────────── */

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
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-800/60">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b border-slate-800/40 px-4 py-3.5 last:border-b-0"
            >
              <div className="h-8 w-8 animate-pulse rounded-lg bg-slate-800" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-32 animate-pulse rounded bg-slate-800" />
                <div className="h-3 w-48 animate-pulse rounded bg-slate-800/60" />
              </div>
              <div className="h-3 w-12 animate-pulse rounded bg-slate-800" />
              <div className="h-3 w-10 animate-pulse rounded bg-slate-800" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ── Header ──────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium tracking-tight text-white">
          Workflows
        </h1>
        <button
          onClick={() => router.push("/workflows/new")}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          Add workflow
        </button>
      </div>

      {/* ── Filters ─────────────────────────────────── */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {/* Active pills */}
        <div className="flex items-center gap-0.5">
          <span className="mr-1 text-[10px] font-medium uppercase tracking-wider text-slate-600">
            Status
          </span>
          {ACTIVE_OPTIONS.map((s) => (
            <FilterPill
              key={s}
              value={s}
              label={s === "ALL" ? "All" : s === "ACTIVE" ? "Active" : "Inactive"}
              active={activeFilter === s}
              dot={
                s === "ACTIVE"
                  ? "bg-emerald-400"
                  : s === "INACTIVE"
                    ? "bg-amber-400"
                    : undefined
              }
              onClick={(v) => setActiveFilter(v)}
            />
          ))}
        </div>

        <div className="h-4 w-px bg-slate-800" />

        {/* Scope pills */}
        <div className="flex items-center gap-0.5">
          <span className="mr-1 text-[10px] font-medium uppercase tracking-wider text-slate-600">
            Scope
          </span>
          {SCOPE_OPTIONS.map((s) => (
            <FilterPill
              key={s}
              value={s}
              label={s === "ALL" ? "All" : SCOPE_LABELS[s as ScopeKind]}
              active={scopeFilter === s}
              onClick={(v) => setScopeFilter(v)}
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

      {/* ── Result count ──────────────────────────── */}
      <p className="mt-4 text-xs text-slate-600">
        {filtered.length} workflow{filtered.length !== 1 && "s"}
        {hasFilters && ` of ${workflows.length}`}
      </p>

      {/* ── List ──────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="text-sm text-slate-500">
            {hasFilters
              ? "No workflows match these filters."
              : "No workflows configured."}
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
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-800/60">
          {filtered.map((wf) => {
            return (
              <div
                key={wf.id}
                className="group flex cursor-pointer items-center gap-4 border-b border-slate-800/40 px-4 py-3.5 transition-colors last:border-b-0 hover:bg-slate-900/60"
                onClick={() => router.push(`/workflows/${wf.id}/edit`)}
              >
                {/* Workflow icon */}
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
                  style={{
                    backgroundColor: "#818cf818",
                    color: "#818cf8",
                  }}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                  </svg>
                </div>

                {/* Name + context path + labels */}
                <div className="min-w-0 flex-1">
                  <span className="truncate text-sm font-medium text-slate-200 transition-colors group-hover:text-indigo-400">
                    {wf.name}
                  </span>

                  <div className="mt-1 flex items-center gap-3">
                    {/* Terminal-path breadcrumb */}
                    <span className="shrink-0 font-mono text-xs text-slate-500">
                      <span className="text-indigo-500">~</span>
                      {getContextPath(wf).map((part, i) => (
                        <span key={i}>
                          <span className="text-slate-700"> / </span>
                          {part}
                        </span>
                      ))}
                    </span>

                    {/* Label dots */}
                    {wf.labels.length > 0 && (
                      <>
                        <span className="h-3 w-px shrink-0 bg-slate-800" />
                        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                          {wf.labels.map((label) => (
                            <span
                              key={label.id}
                              className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-500"
                            >
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: label.color }}
                              />
                              {label.name}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Active indicator */}
                <div className="flex shrink-0 items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      wf.is_active ? "bg-emerald-400" : "bg-amber-400"
                    }`}
                  />
                  <span
                    className={`text-xs font-medium ${
                      wf.is_active ? "text-emerald-400" : "text-amber-400"
                    }`}
                  >
                    {wf.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                {/* Node count */}
                <span className="w-16 shrink-0 text-right text-xs text-slate-600">
                  {wf.nodes_count} node{wf.nodes_count !== 1 && "s"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
