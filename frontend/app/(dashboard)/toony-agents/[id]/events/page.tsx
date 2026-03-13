"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getToonyAgent, listSystemEvents } from "@/lib/api/toony-agents";
import type {
  ToonyAgentDetail,
  AgentSystemEventType,
  AgentSystemEventItem,
} from "@/types";

/* ── Event config ─────────────────────────────────────── */

const EVENT_TYPE_STYLES: Record<
  AgentSystemEventType,
  { text: string; bg: string; border: string; label: string; icon: string }
> = {
  REPO_CLONE_SUCCESS: {
    text: "text-emerald-400",
    bg: "bg-emerald-500/15",
    border: "border-l-emerald-500/50",
    label: "Clone OK",
    icon: "M6 3v2.5M10 3v2.5M3 8h10M4.5 4.5h7a1 1 0 011 1v7a1 1 0 01-1 1h-7a1 1 0 01-1-1v-7a1 1 0 011-1z",
  },
  REPO_CLONE_ERROR: {
    text: "text-red-400",
    bg: "bg-red-500/15",
    border: "border-l-red-500/50",
    label: "Clone Error",
    icon: "M6 3v2.5M10 3v2.5M3 8h10M4.5 4.5h7a1 1 0 011 1v7a1 1 0 01-1 1h-7a1 1 0 01-1-1v-7a1 1 0 011-1z",
  },
  CONFIG_SYNC_COMPLETED: {
    text: "text-emerald-400",
    bg: "bg-emerald-500/15",
    border: "border-l-emerald-500/50",
    label: "Sync OK",
    icon: "M1.5 8h2.25l1.5-3.5 2.5 7 2.5-7 1.5 3.5h2.75",
  },
  CONFIG_SYNC_FAILED: {
    text: "text-red-400",
    bg: "bg-red-500/15",
    border: "border-l-red-500/50",
    label: "Sync Error",
    icon: "M1.5 8h2.25l1.5-3.5 2.5 7 2.5-7 1.5 3.5h2.75",
  },
};

type EventFilter = "ALL" | "CLONE" | "SYNC" | "ERRORS";

const EVENT_FILTER_OPTIONS: { value: EventFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "CLONE", label: "Clones" },
  { value: "SYNC", label: "Syncs" },
  { value: "ERRORS", label: "Errors" },
];

const CLONE_EVENTS: AgentSystemEventType[] = ["REPO_CLONE_SUCCESS", "REPO_CLONE_ERROR"];
const SYNC_EVENTS: AgentSystemEventType[] = ["CONFIG_SYNC_COMPLETED", "CONFIG_SYNC_FAILED"];
const ERROR_EVENTS: AgentSystemEventType[] = ["REPO_CLONE_ERROR", "CONFIG_SYNC_FAILED"];

/* ── Helpers ──────────────────────────────────────────── */

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getEventDetail(evt: AgentSystemEventItem): {
  headline: string;
  details: { label: string; value: string; mono?: boolean }[];
  isError: boolean;
} {
  const d = evt.data;
  switch (evt.event_type) {
    case "REPO_CLONE_SUCCESS": {
      const details: { label: string; value: string; mono?: boolean }[] = [];
      if (d.repository_url) details.push({ label: "Repository", value: String(d.repository_url), mono: true });
      if (d.branch) details.push({ label: "Branch", value: String(d.branch), mono: true });
      if (typeof d.clone_duration_ms === "number" && d.clone_duration_ms > 0)
        details.push({ label: "Duration", value: `${d.clone_duration_ms}ms` });
      return { headline: String(d.repository_url || "Repository cloned"), details, isError: false };
    }
    case "REPO_CLONE_ERROR": {
      const details: { label: string; value: string; mono?: boolean }[] = [];
      if (d.repository_url) details.push({ label: "Repository", value: String(d.repository_url), mono: true });
      if (d.error) details.push({ label: "Error", value: String(d.error) });
      return { headline: String(d.repository_url || "Clone failed"), details, isError: true };
    }
    case "CONFIG_SYNC_COMPLETED": {
      const details: { label: string; value: string }[] = [];
      if (typeof d.org_count === "number") details.push({ label: "Organizations", value: String(d.org_count) });
      if (typeof d.project_count === "number") details.push({ label: "Projects", value: String(d.project_count) });
      return { headline: "Configuration synced successfully", details, isError: false };
    }
    case "CONFIG_SYNC_FAILED": {
      const details: { label: string; value: string }[] = [];
      if (d.error) details.push({ label: "Error", value: String(d.error) });
      return { headline: "Configuration sync failed", details, isError: true };
    }
  }
}

/* ── Page ──────────────────────────────────────────────── */

export default function AgentSystemEventsPage() {
  const params = useParams();
  const agentId = params.id as string;

  const [agent, setAgent] = useState<ToonyAgentDetail | null>(null);
  const [events, setEvents] = useState<AgentSystemEventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<EventFilter>("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [agentData, eventsData] = await Promise.all([
        getToonyAgent(agentId),
        listSystemEvents(agentId),
      ]);
      setAgent(agentData);
      setEvents(eventsData.results);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ── Derived ────────────────────────────────────────── */

  const counts = useMemo(() => {
    let clones = 0, syncs = 0, errors = 0;
    events.forEach((e) => {
      if (CLONE_EVENTS.includes(e.event_type)) clones++;
      if (SYNC_EVENTS.includes(e.event_type)) syncs++;
      if (ERROR_EVENTS.includes(e.event_type)) errors++;
    });
    return { total: events.length, clones, syncs, errors };
  }, [events]);

  const filtered = useMemo(() => {
    switch (filter) {
      case "CLONE":
        return events.filter((e) => CLONE_EVENTS.includes(e.event_type));
      case "SYNC":
        return events.filter((e) => SYNC_EVENTS.includes(e.event_type));
      case "ERRORS":
        return events.filter((e) => ERROR_EVENTS.includes(e.event_type));
      default:
        return events;
    }
  }, [events, filter]);

  /* ── Loading ────────────────────────────────────────── */

  if (isLoading) {
    return (
      <div>
        <div className="h-4 w-32 animate-pulse rounded bg-slate-800" />
        <div className="mt-6 h-6 w-48 animate-pulse rounded bg-slate-800" />
        <div className="mt-6 grid grid-cols-4 gap-px overflow-hidden rounded-xl border border-slate-800/60 bg-slate-800/30">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[72px] animate-pulse bg-slate-950" />
          ))}
        </div>
        <div className="mt-6 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-[52px] animate-pulse rounded-lg border border-slate-800/60 bg-slate-900" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ── Breadcrumb ──────────────────────────────────── */}
      <div className="mb-6 flex items-center gap-2 text-sm text-slate-500">
        <Link href="/toony-agents" className="transition-colors hover:text-slate-300">
          Toony Agents
        </Link>
        <span className="text-slate-700">/</span>
        <Link href={`/toony-agents/${agentId}`} className="transition-colors hover:text-slate-300">
          {agent?.name ?? "Agent"}
        </Link>
        <span className="text-slate-700">/</span>
        <span className="text-slate-300">System Events</span>
      </div>

      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800/60">
          <svg
            className="h-4.5 w-4.5 text-slate-400"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1.5 8h2.25l1.5-3.5 2.5 7 2.5-7 1.5 3.5h2.75" />
          </svg>
        </span>
        <div>
          <h1 className="text-lg font-medium tracking-tight text-white">System Events</h1>
          <p className="text-xs text-slate-500">Runner activity for {agent?.name}</p>
        </div>
      </div>

      {/* ── Metrics strip ───────────────────────────────── */}
      <div className="mt-6 grid grid-cols-4 gap-px overflow-hidden rounded-xl border border-slate-800/60 bg-slate-800/30">
        <div className="bg-slate-950 px-5 py-4">
          <dt className="text-xs font-medium uppercase tracking-wider text-slate-600">Total</dt>
          <dd className="mt-1.5 text-xl font-medium tracking-tight text-white">{counts.total}</dd>
        </div>
        <div className="bg-slate-950 px-5 py-4">
          <dt className="text-xs font-medium uppercase tracking-wider text-slate-600">Clones</dt>
          <dd className="mt-1.5 text-xl font-medium tracking-tight text-white">{counts.clones}</dd>
        </div>
        <div className="bg-slate-950 px-5 py-4">
          <dt className="text-xs font-medium uppercase tracking-wider text-slate-600">Syncs</dt>
          <dd className="mt-1.5 text-xl font-medium tracking-tight text-white">{counts.syncs}</dd>
        </div>
        <div className="bg-slate-950 px-5 py-4">
          <dt className="text-xs font-medium uppercase tracking-wider text-slate-600">Errors</dt>
          <dd className={`mt-1.5 text-xl font-medium tracking-tight ${counts.errors > 0 ? "text-red-400" : "text-white"}`}>
            {counts.errors}
          </dd>
        </div>
      </div>

      {/* ── Filter bar ──────────────────────────────────── */}
      <div className="mt-6 flex items-center justify-between">
        <div className="flex items-center gap-0.5">
          {EVENT_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === opt.value
                  ? "bg-slate-800 text-slate-200"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-600">
          {filtered.length} event{filtered.length !== 1 && "s"}
          {filter !== "ALL" && ` of ${events.length}`}
        </p>
      </div>

      {/* ── Event list ──────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="mt-16 text-center">
          {filter !== "ALL" ? (
            <>
              <p className="text-sm text-slate-500">No events match this filter.</p>
              <button
                onClick={() => setFilter("ALL")}
                className="mt-2 text-sm text-indigo-400 transition-colors hover:text-indigo-300"
              >
                Clear filter
              </button>
            </>
          ) : (
            <div>
              <div className="font-mono text-sm text-slate-500">
                <span className="text-indigo-500">~</span>
                <span className="text-slate-600">/</span>
                <span> no system events</span>
              </div>
              <p className="mt-2 text-xs text-slate-600">
                Events appear when the runner clones repos or syncs config.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-1.5">
          {filtered.map((evt) => {
            const es = EVENT_TYPE_STYLES[evt.event_type];
            const detail = getEventDetail(evt);
            const isExpanded = expandedId === evt.id;

            return (
              <div key={evt.id}>
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : evt.id)}
                  className={`w-full text-left rounded-lg border border-slate-800/60 border-l-2 ${es.border} bg-slate-900 px-4 py-3 transition-all hover:border-slate-700/60 ${
                    isExpanded ? "border-slate-700/60" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${es.bg}`}>
                        <svg
                          className={`h-3.5 w-3.5 ${es.text}`}
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d={es.icon} />
                        </svg>
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${es.bg} ${es.text}`}>
                        {es.label}
                      </span>
                      {evt.organization && (
                        <span className="truncate font-mono text-xs text-slate-500">
                          <span className="text-indigo-500">~</span>
                          <span className="text-slate-700">/</span>
                          {evt.organization.name}
                          {evt.project && (
                            <>
                              <span className="text-slate-700">/</span>
                              {evt.project.name}
                            </>
                          )}
                        </span>
                      )}
                      <span className="hidden truncate text-xs text-slate-500 sm:block">
                        {detail.headline}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs text-slate-600">{timeAgo(evt.created_at)}</span>
                      <svg
                        className={`h-3.5 w-3.5 text-slate-700 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                      </svg>
                    </div>
                  </div>
                </button>

                {/* ── Expanded detail ──────────────────── */}
                {isExpanded && (
                  <div className={`mx-3 rounded-b-lg border border-t-0 border-slate-800/60 ${detail.isError ? "bg-red-500/[0.03]" : "bg-slate-900/50"} px-5 py-4`}>
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <span>{fmtDate(evt.created_at)}</span>
                      <span className="text-slate-800">|</span>
                      <span className="font-mono text-slate-500">{evt.id.slice(0, 8)}</span>
                    </div>

                    {detail.details.length > 0 && (
                      <dl className="mt-3 space-y-2">
                        {detail.details.map((d) => (
                          <div key={d.label} className="flex items-start gap-3">
                            <dt className="w-24 shrink-0 text-xs font-medium text-slate-500">{d.label}</dt>
                            <dd
                              className={`min-w-0 break-all text-xs ${
                                d.label === "Error" ? "text-red-400/80" : "text-slate-300"
                              } ${d.mono ? "font-mono" : ""}`}
                            >
                              {d.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}

                    {detail.details.length === 0 && (
                      <p className="mt-3 text-xs text-slate-600">No additional details.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
