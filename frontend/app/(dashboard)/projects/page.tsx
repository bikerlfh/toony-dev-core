"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { listProjects } from "@/lib/api/projects";
import { listOrganizations } from "@/lib/api/organizations";
import type {
  ProjectList,
  ProjectStatus,
  ProjectPriority,
  Organization,
} from "@/types";

/* ── Status maps ──────────────────────────────────────── */

const STATUS_LABELS: Record<ProjectStatus, string> = {
  BACKLOG: "Backlog",
  PLANNED: "Planned",
  IN_PROGRESS: "Active",
  PAUSED: "Paused",
  COMPLETED: "Done",
  CANCELED: "Canceled",
};

const STATUS_STYLES: Record<
  ProjectStatus,
  { border: string; dot: string; text: string }
> = {
  BACKLOG: {
    border: "border-l-slate-600",
    dot: "bg-slate-500",
    text: "text-slate-400",
  },
  PLANNED: {
    border: "border-l-blue-500",
    dot: "bg-blue-400",
    text: "text-blue-400",
  },
  IN_PROGRESS: {
    border: "border-l-amber-500",
    dot: "bg-amber-400",
    text: "text-amber-400",
  },
  PAUSED: {
    border: "border-l-orange-500",
    dot: "bg-orange-400",
    text: "text-orange-400",
  },
  COMPLETED: {
    border: "border-l-emerald-500",
    dot: "bg-emerald-400",
    text: "text-emerald-400",
  },
  CANCELED: {
    border: "border-l-red-500",
    dot: "bg-red-400",
    text: "text-red-400",
  },
};

/* ── Priority maps ────────────────────────────────────── */

const PRIORITY_META: Record<
  Exclude<ProjectPriority, "NONE">,
  { bars: number; color: string }
> = {
  URGENT: { bars: 4, color: "bg-red-500" },
  HIGH: { bars: 3, color: "bg-orange-500" },
  MEDIUM: { bars: 2, color: "bg-amber-500" },
  LOW: { bars: 1, color: "bg-blue-500" },
};

/* ── Filter option lists ──────────────────────────────── */

const STATUS_OPTIONS: (ProjectStatus | "ALL")[] = [
  "ALL",
  "IN_PROGRESS",
  "PLANNED",
  "BACKLOG",
  "PAUSED",
  "COMPLETED",
  "CANCELED",
];

const PRIORITY_OPTIONS: (Exclude<ProjectPriority, "NONE"> | "ALL")[] = [
  "ALL",
  "URGENT",
  "HIGH",
  "MEDIUM",
  "LOW",
];

/* ── Priority signal-bars indicator ───────────────────── */

function PriorityIndicator({ priority }: { priority: ProjectPriority }) {
  if (priority === "NONE") return null;
  const { bars, color } = PRIORITY_META[priority];
  return (
    <div className="flex items-end gap-[2px]" title={priority}>
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={`w-[3px] rounded-sm ${i <= bars ? color : "bg-slate-800"}`}
          style={{ height: `${4 + i * 2}px` }}
        />
      ))}
    </div>
  );
}

/* ── Filter pill ──────────────────────────────────────── */

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

/* ── Page ──────────────────────────────────────────────── */

export default function ProjectsPage() {
  const router = useRouter();

  const [projects, setProjects] = useState<ProjectList[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [orgFilter, setOrgFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "ALL">(
    "ALL"
  );
  const [priorityFilter, setPriorityFilter] = useState<
    ProjectPriority | "ALL"
  >("ALL");

  const [orgOpen, setOrgOpen] = useState(false);
  const orgRef = useRef<HTMLDivElement>(null);

  /* ── data fetch ──────────────────────────────────────── */

  const fetchData = useCallback(async () => {
    try {
      const [pRes, oRes] = await Promise.all([
        listProjects(),
        listOrganizations(),
      ]);
      setProjects(pRes.results);
      setOrganizations(oRes.results);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ── close org dropdown on outside click ─────────────── */

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (orgRef.current && !orgRef.current.contains(e.target as Node)) {
        setOrgOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  /* ── filtering ───────────────────────────────────────── */

  const filtered = useMemo(
    () =>
      projects.filter((p) => {
        if (orgFilter !== "ALL" && p.organization?.id !== orgFilter)
          return false;
        if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
        if (priorityFilter !== "ALL" && p.priority !== priorityFilter)
          return false;
        return true;
      }),
    [projects, orgFilter, statusFilter, priorityFilter]
  );

  const hasFilters =
    orgFilter !== "ALL" || statusFilter !== "ALL" || priorityFilter !== "ALL";

  function clearFilters() {
    setOrgFilter("ALL");
    setStatusFilter("ALL");
    setPriorityFilter("ALL");
  }

  const selectedOrgName =
    orgFilter === "ALL"
      ? "All organizations"
      : organizations.find((o) => o.id === orgFilter)?.name ?? "Unknown";

  /* ── loading skeleton ────────────────────────────────── */

  if (isLoading) {
    return (
      <div>
        <div className="flex items-center justify-between">
          <div className="h-8 w-32 animate-pulse rounded-md bg-slate-800" />
          <div className="h-9 w-28 animate-pulse rounded-lg bg-slate-800" />
        </div>
        <div className="mt-5 flex gap-3">
          <div className="h-7 w-40 animate-pulse rounded-lg bg-slate-800" />
          <div className="h-7 w-64 animate-pulse rounded-lg bg-slate-800" />
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[140px] animate-pulse rounded-xl border border-slate-800/60 bg-slate-900"
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
          Projects
        </h1>
        <Link
          href="/projects/new"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          New project
        </Link>
      </div>

      {/* ── Filters ──────────────────────────────────────── */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {/* Organization dropdown */}
        <div ref={orgRef} className="relative">
          <button
            onClick={() => setOrgOpen((v) => !v)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              orgFilter !== "ALL"
                ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-400"
                : "border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300"
            }`}
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
              />
            </svg>
            {selectedOrgName}
            <svg
              className={`h-3 w-3 transition-transform ${orgOpen ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 8.25l-7.5 7.5-7.5-7.5"
              />
            </svg>
          </button>

          {orgOpen && (
            <div
              className="absolute left-0 top-full z-20 mt-1 max-h-64 w-56 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900 py-1 shadow-xl"
              style={{ animation: "selectDropdown 150ms ease-out" }}
            >
              <button
                onClick={() => {
                  setOrgFilter("ALL");
                  setOrgOpen(false);
                }}
                className={`flex w-full items-center px-3 py-2 text-left text-xs transition-colors ${
                  orgFilter === "ALL"
                    ? "bg-slate-800/60 text-white"
                    : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
                }`}
              >
                All organizations
              </button>
              {organizations.map((org) => (
                <button
                  key={org.id}
                  onClick={() => {
                    setOrgFilter(org.id);
                    setOrgOpen(false);
                  }}
                  className={`flex w-full items-center px-3 py-2 text-left text-xs transition-colors ${
                    orgFilter === org.id
                      ? "bg-slate-800/60 text-white"
                      : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
                  }`}
                >
                  {org.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="h-4 w-px bg-slate-800" />

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

        {/* Priority pills */}
        <div className="flex items-center gap-0.5">
          <span className="mr-1 text-[10px] font-medium uppercase tracking-wider text-slate-600">
            Priority
          </span>
          {PRIORITY_OPTIONS.map((p) => (
            <FilterPill
              key={p}
              value={p}
              label={
                p === "ALL"
                  ? "All"
                  : p.charAt(0) + p.slice(1).toLowerCase()
              }
              active={priorityFilter === p}
              dot={p !== "ALL" ? PRIORITY_META[p].color : undefined}
              onClick={(v) => setPriorityFilter(v as ProjectPriority | "ALL")}
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
        {filtered.length} project{filtered.length !== 1 && "s"}
        {hasFilters && ` of ${projects.length}`}
      </p>

      {/* ── Grid ─────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="text-sm text-slate-500">
            {hasFilters
              ? "No projects match these filters."
              : "No projects yet."}
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
          {filtered.map((project) => {
            const ss = STATUS_STYLES[project.status];
            return (
              <div
                key={project.id}
                className={`group cursor-pointer rounded-xl border border-l-[3px] border-slate-800/60 ${ss.border} bg-slate-900 p-5 transition-all hover:border-slate-700/60`}
                onClick={() => router.push(`/projects/${project.id}`)}
              >
                {/* Identity: icon + name + org / priority */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm"
                      style={{
                        backgroundColor: project.color
                          ? `${project.color}18`
                          : "rgb(30 41 59 / 0.6)",
                        color: project.color || "rgb(148 163 184)",
                      }}
                    >
                      {project.icon || project.name[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-[15px] font-semibold leading-tight text-white transition-colors group-hover:text-indigo-400">
                        {project.name}
                      </h3>
                      {project.organization && (
                        <span className="mt-1 block truncate text-xs text-slate-500">
                          {project.organization.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <PriorityIndicator priority={project.priority} />
                </div>

                {/* Meta: status + lead + date */}
                <div className="mt-4 flex items-center justify-between border-t border-slate-800/40 pt-3">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${ss.dot}`}
                    />
                    <span className={`text-xs font-medium ${ss.text}`}>
                      {STATUS_LABELS[project.status]}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    {project.lead ? (
                      <div className="flex items-center gap-1.5">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[10px] font-medium text-slate-400">
                          {project.lead.first_name?.[0]?.toUpperCase() ||
                            project.lead.email[0].toUpperCase()}
                        </div>
                        <span className="hidden text-slate-500 sm:inline">
                          {project.lead.first_name}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-700">No lead</span>
                    )}

                    {project.target_date && (
                      <>
                        <span className="text-slate-800">·</span>
                        <span className="text-slate-600">
                          {new Date(project.target_date).toLocaleDateString(
                            "en-US",
                            { month: "short", day: "numeric" }
                          )}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
