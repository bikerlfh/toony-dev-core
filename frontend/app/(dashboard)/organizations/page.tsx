"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { listOrganizations } from "@/lib/api/organizations";
import type { Organization } from "@/types";

/* ── Status filter ────────────────────────────────────── */

type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

const STATUS_OPTIONS: { value: StatusFilter; label: string; dot?: string }[] = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "Active", dot: "bg-emerald-400" },
  { value: "INACTIVE", label: "Inactive", dot: "bg-slate-600" },
];

/* ── Industry label map ───────────────────────────────── */

const INDUSTRY_LABELS: Record<string, string> = {
  technology: "Technology",
  finance: "Finance",
  healthcare: "Healthcare",
  education: "Education",
  retail: "Retail",
  manufacturing: "Manufacturing",
  media: "Media",
  consulting: "Consulting",
  government: "Government",
  nonprofit: "Nonprofit",
};

function industryLabel(raw: string): string {
  if (!raw) return "";
  return INDUSTRY_LABELS[raw.toLowerCase()] || raw;
}

/* ── Page ──────────────────────────────────────────────── */

export default function OrganizationsPage() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ACTIVE");

  const fetchOrganizations = useCallback(async () => {
    try {
      const res = await listOrganizations();
      setOrganizations(res.results);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  /* ── Filtering ────────────────────────────────────────── */

  const filtered = useMemo(
    () =>
      organizations.filter((o) => {
        if (statusFilter === "ACTIVE") return o.is_active;
        if (statusFilter === "INACTIVE") return !o.is_active;
        return true;
      }),
    [organizations, statusFilter]
  );

  const hasFilter = statusFilter !== "ALL";

  /* ── Loading skeleton ────────────────────────────────── */

  if (isLoading) {
    return (
      <div>
        <div className="flex items-center justify-between">
          <div className="h-8 w-44 animate-pulse rounded-md bg-slate-800" />
          <div className="h-9 w-40 animate-pulse rounded-lg bg-slate-800" />
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[160px] animate-pulse rounded-xl border border-slate-800/60 bg-slate-900"
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
          Organizations
        </h1>
        <Link
          href="/organizations/new"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          Create organization
        </Link>
      </div>

      {/* ── Filters ──────────────────────────────────────── */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-0.5">
          <span className="mr-1 text-[10px] font-medium uppercase tracking-wider text-slate-600">
            Status
          </span>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                statusFilter === opt.value
                  ? "bg-slate-800 text-slate-200"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {opt.dot && (
                <span className={`h-1.5 w-1.5 rounded-full ${opt.dot}`} />
              )}
              {opt.label}
            </button>
          ))}
        </div>

        {hasFilter && (
          <button
            onClick={() => setStatusFilter("ALL")}
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

      {/* ── Count ────────────────────────────────────────── */}
      <p className="mt-4 text-xs text-slate-600">
        {filtered.length} organization
        {filtered.length !== 1 && "s"}
        {hasFilter && ` of ${organizations.length}`}
      </p>

      {/* ── Grid ─────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="text-sm text-slate-500">
            {hasFilter
              ? "No organizations match this filter."
              : "No organizations yet."}
          </p>
          {hasFilter && (
            <button
              onClick={() => setStatusFilter("ALL")}
              className="mt-2 text-sm text-indigo-400 transition-colors hover:text-indigo-300"
            >
              Clear filter
            </button>
          )}
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((org) => (
            <div
              key={org.id}
              className="group cursor-pointer rounded-xl border border-slate-800/60 bg-slate-900 p-5 transition-all hover:border-slate-700/60"
              onClick={() => router.push(`/organizations/${org.id}`)}
            >
              {/* Identity: logo/initial + name + slug · industry */}
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800/60 text-sm font-semibold text-slate-400">
                  {org.logo ? (
                    <img
                      src={org.logo}
                      alt=""
                      className="h-9 w-9 rounded-lg object-cover"
                    />
                  ) : (
                    org.name[0]?.toUpperCase()
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-[15px] font-semibold leading-tight text-white transition-colors group-hover:text-indigo-400">
                    {org.name}
                  </h3>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="truncate font-mono">{org.slug}</span>
                    {org.industry && (
                      <>
                        <span className="text-slate-700">·</span>
                        <span className="truncate">
                          {industryLabel(org.industry)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Description */}
              {org.description && (
                <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-slate-500">
                  {org.description}
                </p>
              )}

              {/* Meta: status + members + created */}
              <div className="mt-4 flex items-center justify-between border-t border-slate-800/40 pt-3">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      org.is_active ? "bg-emerald-400" : "bg-slate-600"
                    }`}
                  />
                  <span
                    className={`text-xs font-medium ${
                      org.is_active ? "text-emerald-400" : "text-slate-500"
                    }`}
                  >
                    {org.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <svg
                      className="h-3.5 w-3.5 text-slate-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
                      />
                    </svg>
                    {org.member_count}
                  </div>

                  <span className="text-slate-800">·</span>

                  <span className="text-slate-600">
                    {new Date(org.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
