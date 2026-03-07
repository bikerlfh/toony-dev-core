"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { listSkills, deleteSkill } from "@/lib/api/skills";
import { ConfirmModal } from "@/components/confirm-modal";
import type { SkillList, SkillCategory, SkillStatus } from "@/types";

/* ── Status maps ──────────────────────────────────────── */

const STATUS_LABELS: Record<SkillStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  DEPRECATED: "Deprecated",
};

const STATUS_STYLES: Record<
  SkillStatus,
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

/* ── Category maps ───────────────────────────────────── */

const CATEGORY_LABELS: Record<SkillCategory, string> = {
  CODING: "Coding",
  TESTING: "Testing",
  REVIEW: "Review",
  DOCUMENTATION: "Documentation",
  DEPLOYMENT: "Deployment",
  CUSTOM: "Custom",
};

const CATEGORY_ICONS: Record<SkillCategory, string> = {
  CODING: ">_",
  TESTING: "T",
  REVIEW: "R",
  DOCUMENTATION: "D",
  DEPLOYMENT: "^",
  CUSTOM: "*",
};

const CATEGORY_COLORS: Record<SkillCategory, string> = {
  CODING: "#818cf8",
  TESTING: "#34d399",
  REVIEW: "#f59e0b",
  DOCUMENTATION: "#60a5fa",
  DEPLOYMENT: "#a78bfa",
  CUSTOM: "#94a3b8",
};

/* ── Filter options ──────────────────────────────────── */

const STATUS_OPTIONS: (SkillStatus | "ALL")[] = [
  "ALL",
  "ACTIVE",
  "DRAFT",
  "INACTIVE",
  "DEPRECATED",
];

const CATEGORY_OPTIONS: (SkillCategory | "ALL")[] = [
  "ALL",
  "CODING",
  "TESTING",
  "REVIEW",
  "DOCUMENTATION",
  "DEPLOYMENT",
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

export default function SkillsPage() {
  const router = useRouter();
  const canManage = true;

  const [skills, setSkills] = useState<SkillList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<SkillList | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [statusFilter, setStatusFilter] = useState<SkillStatus | "ALL">("ALL");
  const [categoryFilter, setCategoryFilter] = useState<SkillCategory | "ALL">(
    "ALL"
  );

  const fetchSkills = useCallback(async () => {
    try {
      setSkills((await listSkills()).results);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  /* ── filtering ──────────────────────────────────────── */

  const filtered = useMemo(
    () =>
      skills.filter((s) => {
        if (statusFilter !== "ALL" && s.status !== statusFilter) return false;
        if (categoryFilter !== "ALL" && s.category !== categoryFilter)
          return false;
        return true;
      }),
    [skills, statusFilter, categoryFilter]
  );

  const hasFilters = statusFilter !== "ALL" || categoryFilter !== "ALL";

  function clearFilters() {
    setStatusFilter("ALL");
    setCategoryFilter("ALL");
  }

  /* ── delete ─────────────────────────────────────────── */

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteSkill(deleteTarget.slug);
      setDeleteTarget(null);
      fetchSkills();
    } finally {
      setIsDeleting(false);
    }
  }

  /* ── loading skeleton ───────────────────────────────── */

  if (isLoading) {
    return (
      <div>
        <div className="flex items-center justify-between">
          <div className="h-8 w-24 animate-pulse rounded-md bg-slate-800" />
          <div className="h-9 w-24 animate-pulse rounded-lg bg-slate-800" />
        </div>
        <div className="mt-5 flex gap-3">
          <div className="h-7 w-48 animate-pulse rounded-lg bg-slate-800" />
          <div className="h-7 w-64 animate-pulse rounded-lg bg-slate-800" />
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
          Skills
        </h1>
        {canManage && (
          <button
            onClick={() => router.push("/skills/new")}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            Add skill
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

        {/* Category pills */}
        <div className="flex items-center gap-0.5">
          <span className="mr-1 text-[10px] font-medium uppercase tracking-wider text-slate-600">
            Category
          </span>
          {CATEGORY_OPTIONS.map((c) => (
            <FilterPill
              key={c}
              value={c}
              label={c === "ALL" ? "All" : CATEGORY_LABELS[c]}
              active={categoryFilter === c}
              onClick={(v) => setCategoryFilter(v)}
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
        {filtered.length} skill{filtered.length !== 1 && "s"}
        {hasFilters && ` of ${skills.length}`}
      </p>

      {/* ── Grid ─────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="text-sm text-slate-500">
            {hasFilters
              ? "No skills match these filters."
              : "No skills configured."}
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
          {filtered.map((skill) => {
            const ss = STATUS_STYLES[skill.status];
            const catColor = CATEGORY_COLORS[skill.category];
            return (
              <div
                key={skill.id}
                className={`group cursor-pointer rounded-xl border border-l-[3px] border-slate-800/60 ${ss.border} bg-slate-900 p-5 transition-all hover:border-slate-700/60`}
                onClick={() => router.push(`/skills/${skill.id}/edit`)}
              >
                {/* Identity: icon + name + badges */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                      style={{
                        backgroundColor: `${catColor}18`,
                        color: catColor,
                      }}
                    >
                      {CATEGORY_ICONS[skill.category]}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-[15px] font-semibold leading-tight text-white transition-colors group-hover:text-indigo-400">
                        {skill.name}
                      </h3>
                      <span className="mt-1 block text-xs text-slate-500">
                        {CATEGORY_LABELS[skill.category]}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {skill.is_external && (
                      <span className="inline-flex rounded-full bg-purple-900/50 px-2 py-0.5 text-[10px] font-medium text-purple-400">
                        External
                      </span>
                    )}
                    {!skill.organization && (
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
                      {STATUS_LABELS[skill.status]}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-slate-600">v{skill.version}</span>
                    {canManage && (
                      <>
                        <span className="text-slate-800">&middot;</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/skills/${skill.id}/edit`);
                          }}
                          className="text-indigo-400 transition-colors hover:text-indigo-300"
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(skill);
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
          title="Delete skill"
          message={`Delete skill "${deleteTarget.name}"? This will also remove it from all agents.`}
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
