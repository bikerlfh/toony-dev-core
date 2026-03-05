"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { listToonyAgents } from "@/lib/api/toony-agents";
import { RegisterBotModal } from "@/components/toony-agents/register-bot-modal";
import type { ToonyAgentList, ToonyAgentStatus } from "@/types";

/* ── Status config ────────────────────────────────────── */

type StatusFilter = "ALL" | ToonyAgentStatus;

const STATUS_OPTIONS: { value: StatusFilter; label: string; dot?: string }[] = [
  { value: "ALL", label: "All" },
  { value: "ONLINE", label: "Online", dot: "bg-emerald-400" },
  { value: "BUSY", label: "Busy", dot: "bg-blue-400" },
  { value: "OFFLINE", label: "Offline", dot: "bg-slate-600" },
];

const STATUS_STYLES: Record<ToonyAgentStatus, { dot: string; text: string }> = {
  ONLINE: { dot: "bg-emerald-400", text: "text-emerald-400" },
  BUSY: { dot: "bg-blue-400", text: "text-blue-400" },
  OFFLINE: { dot: "bg-slate-600", text: "text-slate-500" },
};

/* ── Helpers ──────────────────────────────────────────── */

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/* ── Page ──────────────────────────────────────────────── */

export default function ToonyAgentsPage() {
  const router = useRouter();

  const [agents, setAgents] = useState<ToonyAgentList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const fetchAgents = useCallback(async () => {
    try {
      setAgents((await listToonyAgents()).results);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  /* ── Filtering ────────────────────────────────────────── */

  const filtered = useMemo(
    () =>
      agents.filter((a) => {
        if (statusFilter === "ALL") return true;
        return a.status === statusFilter;
      }),
    [agents, statusFilter]
  );

  const hasFilter = statusFilter !== "ALL";

  /* ── Status counts ────────────────────────────────────── */

  const counts = useMemo(() => {
    const c = { ONLINE: 0, BUSY: 0, OFFLINE: 0 };
    agents.forEach((a) => c[a.status]++);
    return c;
  }, [agents]);

  function handleRegisterSuccess(agentId: string) {
    router.push(`/toony-agents/${agentId}`);
  }

  /* ── Loading skeleton ────────────────────────────────── */

  if (isLoading) {
    return (
      <div>
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 animate-pulse rounded-md bg-slate-800" />
          <div className="h-9 w-36 animate-pulse rounded-lg bg-slate-800" />
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
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
          Toony Agents
        </h1>
        <button
          onClick={() => setShowRegisterModal(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          + Register Bot
        </button>
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
              {opt.value !== "ALL" && (
                <span className="ml-0.5 text-slate-600">
                  {counts[opt.value as ToonyAgentStatus]}
                </span>
              )}
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
        {filtered.length} agent{filtered.length !== 1 && "s"}
        {hasFilter && ` of ${agents.length}`}
      </p>

      {/* ── Grid ─────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="text-sm text-slate-500">
            {hasFilter
              ? "No agents match this filter."
              : "No bots registered yet."}
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
          {filtered.map((agent) => {
            const style = STATUS_STYLES[agent.status];

            return (
              <div
                key={agent.id}
                onClick={() => router.push(`/toony-agents/${agent.id}`)}
                className="group cursor-pointer rounded-xl border border-slate-800/60 bg-slate-900 p-5 transition-all hover:border-slate-700/60"
              >
                {/* Top: name + status */}
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h3 className="truncate text-[15px] font-semibold leading-tight text-white transition-colors group-hover:text-indigo-400">
                      {agent.name}
                    </h3>
                    <span className="mt-1 inline-block truncate font-mono text-xs text-slate-500">
                      {agent.slug}
                    </span>
                  </div>
                  <span className="ml-3 flex shrink-0 items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                    <span className={`text-xs font-medium ${style.text}`}>
                      {agent.status.charAt(0) + agent.status.slice(1).toLowerCase()}
                    </span>
                  </span>
                </div>

                {/* Bottom: heartbeat + created */}
                <div className="mt-4 flex items-center justify-between border-t border-slate-800/40 pt-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <svg
                      className="h-3.5 w-3.5 text-slate-600"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M1.5 8h2.25l1.5-3.5 2.5 7 2.5-7 1.5 3.5h2.75" />
                    </svg>
                    {timeAgo(agent.last_heartbeat)}
                  </div>
                  <span className="text-xs text-slate-600">
                    {new Date(agent.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Register modal */}
      <RegisterBotModal
        isOpen={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
        onSuccess={handleRegisterSuccess}
      />
    </div>
  );
}
