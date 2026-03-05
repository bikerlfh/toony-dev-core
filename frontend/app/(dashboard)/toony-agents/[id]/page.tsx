"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getToonyAgent, listAgentTasks } from "@/lib/api/toony-agents";
import { useToonyAgentWebSocket } from "@/hooks/use-toony-agent-websocket";
import { ManageKeysModal } from "@/components/toony-agents/manage-keys-modal";
import { CreateTaskModal } from "@/components/toony-agents/create-task-modal";
import type {
  ToonyAgentDetail,
  AgentTaskList,
  AgentTaskStatus,
  ToonyAgentStatus,
  ToonyAgentWsEvent,
} from "@/types";

/* ── Status config ────────────────────────────────────── */

const AGENT_STATUS_STYLES: Record<ToonyAgentStatus, { dot: string; border: string; text: string }> = {
  ONLINE: { dot: "bg-emerald-400", border: "border-emerald-500/20 bg-emerald-500/10", text: "text-emerald-400" },
  BUSY: { dot: "bg-blue-400", border: "border-blue-500/20 bg-blue-500/10", text: "text-blue-400" },
  OFFLINE: { dot: "bg-slate-600", border: "border-slate-700 bg-slate-800", text: "text-slate-500" },
};

const TASK_STATUS_STYLES: Record<AgentTaskStatus, { dot: string; text: string; bg: string }> = {
  QUEUED: { dot: "bg-slate-500", text: "text-slate-400", bg: "bg-slate-500/15" },
  ASSIGNED: { dot: "bg-blue-400", text: "text-blue-400", bg: "bg-blue-500/15" },
  RUNNING: { dot: "bg-amber-400", text: "text-amber-400", bg: "bg-amber-500/15" },
  AWAITING_APPROVAL: { dot: "bg-purple-400", text: "text-purple-400", bg: "bg-purple-500/15" },
  COMPLETED: { dot: "bg-emerald-400", text: "text-emerald-400", bg: "bg-emerald-500/15" },
  FAILED: { dot: "bg-red-400", text: "text-red-400", bg: "bg-red-500/15" },
  CANCELLED: { dot: "bg-slate-500", text: "text-slate-400", bg: "bg-slate-500/15" },
};

const TASK_STATUS_LABELS: Record<AgentTaskStatus, string> = {
  QUEUED: "Queued",
  ASSIGNED: "Assigned",
  RUNNING: "Running",
  AWAITING_APPROVAL: "Approval",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

type TaskFilter = "ALL" | "ACTIVE" | "COMPLETED" | "FAILED";

const TASK_FILTER_OPTIONS: { value: TaskFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "COMPLETED", label: "Completed" },
  { value: "FAILED", label: "Failed" },
];

const ACTIVE_STATUSES: AgentTaskStatus[] = ["QUEUED", "ASSIGNED", "RUNNING", "AWAITING_APPROVAL"];

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

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/* ── Page ──────────────────────────────────────────────── */

export default function ToonyAgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;

  const [agent, setAgent] = useState<ToonyAgentDetail | null>(null);
  const [tasks, setTasks] = useState<AgentTaskList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showKeysModal, setShowKeysModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("ALL");

  const fetchAgent = useCallback(async () => {
    try {
      const data = await getToonyAgent(agentId);
      setAgent(data);
    } catch {
      router.push("/toony-agents");
    } finally {
      setIsLoading(false);
    }
  }, [agentId, router]);

  const fetchTasks = useCallback(async () => {
    try {
      setTasks((await listAgentTasks(agentId)).results);
    } catch {
      // Tasks may fail if agent doesn't exist yet
    }
  }, [agentId]);

  useEffect(() => {
    fetchAgent();
    fetchTasks();
  }, [fetchAgent, fetchTasks]);

  /* ── WebSocket ────────────────────────────────────────── */

  const handleWsEvent = useCallback(
    (event: ToonyAgentWsEvent) => {
      if (event.type === "agent.status") {
        setAgent((prev) =>
          prev ? { ...prev, status: event.status as ToonyAgentStatus } : prev
        );
      } else if (event.type === "task.status") {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === event.task_id ? { ...t, status: event.status as AgentTaskStatus } : t
          )
        );
      }
    },
    []
  );

  useToonyAgentWebSocket({
    agentId: agent?.id ?? null,
    onEvent: handleWsEvent,
  });

  /* ── Task stats ───────────────────────────────────────── */

  const stats = useMemo(() => {
    let active = 0, completed = 0, failed = 0;
    tasks.forEach((t) => {
      if (ACTIVE_STATUSES.includes(t.status)) active++;
      else if (t.status === "COMPLETED") completed++;
      else if (t.status === "FAILED") failed++;
    });
    return { total: tasks.length, active, completed, failed };
  }, [tasks]);

  /* ── Task filtering ───────────────────────────────────── */

  const filteredTasks = useMemo(() => {
    switch (taskFilter) {
      case "ACTIVE":
        return tasks.filter((t) => ACTIVE_STATUSES.includes(t.status));
      case "COMPLETED":
        return tasks.filter((t) => t.status === "COMPLETED");
      case "FAILED":
        return tasks.filter((t) => t.status === "FAILED");
      default:
        return tasks;
    }
  }, [tasks, taskFilter]);

  const hasTaskFilter = taskFilter !== "ALL";

  function handleTaskCreated(taskId: string) {
    router.push(`/toony-agents/${agentId}/tasks/${taskId}`);
  }

  /* ── Loading ──────────────────────────────────────────── */

  if (isLoading) {
    return (
      <div>
        <div className="h-4 w-32 animate-pulse rounded bg-slate-800" />
        <div className="mt-6 h-[140px] animate-pulse rounded-xl border border-slate-800/60 bg-slate-900" />
        <div className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-slate-800/60 bg-slate-800/30">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[88px] animate-pulse bg-slate-950" />
          ))}
        </div>
      </div>
    );
  }

  if (!agent) return null;

  const statusStyle = AGENT_STATUS_STYLES[agent.status];

  return (
    <div>
      {/* ── Breadcrumb ─────────────────────────────────────── */}
      <div className="mb-4">
        <Link
          href="/toony-agents"
          className="text-sm text-slate-500 transition-colors hover:text-slate-300"
        >
          &larr; Toony Agents
        </Link>
      </div>

      {/* ── Agent identity card ────────────────────────────── */}
      <div className="rounded-xl border border-slate-800/60 bg-slate-900 p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            {/* Bot icon */}
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-800/60">
              <svg
                className="h-6 w-6 text-slate-400"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="10" height="8" rx="2" />
                <circle cx="6" cy="8" r="0.75" fill="currentColor" stroke="none" />
                <circle cx="10" cy="8" r="0.75" fill="currentColor" stroke="none" />
                <path d="M8 1.5v2.5" />
                <path d="M1 7.5v1" />
                <path d="M15 7.5v1" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="truncate text-lg font-medium text-white">{agent.name}</h1>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusStyle.border} ${statusStyle.text}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
                  {agent.status.charAt(0) + agent.status.slice(1).toLowerCase()}
                </span>
              </div>
              <span className="mt-1 inline-block font-mono text-sm text-slate-500">{agent.slug}</span>
              <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5 text-slate-600" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1.5 8h2.25l1.5-3.5 2.5 7 2.5-7 1.5 3.5h2.75" />
                  </svg>
                  {timeAgo(agent.last_heartbeat)}
                </span>
                <span>
                  Registered by {agent.registered_by.first_name} {agent.registered_by.last_name}
                </span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => setShowTaskModal(true)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
            >
              + New Task
            </button>
            <button
              onClick={() => setShowKeysModal(true)}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-slate-600 hover:text-white"
            >
              Manage Keys
            </button>
          </div>
        </div>
      </div>

      {/* ── Stats bento grid ───────────────────────────────── */}
      <div className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-slate-800/60 bg-slate-800/30">
        <div className="bg-slate-950 p-5">
          <dt className="text-xs font-medium uppercase tracking-wider text-slate-600">Active</dt>
          <dd className="mt-2 text-2xl font-medium tracking-tight text-white">
            {stats.active}
          </dd>
          <p className="mt-1 text-xs text-slate-600">running / queued</p>
        </div>
        <div className="bg-slate-950 p-5">
          <dt className="text-xs font-medium uppercase tracking-wider text-slate-600">Completed</dt>
          <dd className="mt-2 text-2xl font-medium tracking-tight text-emerald-400">
            {stats.completed}
          </dd>
          <p className="mt-1 text-xs text-slate-600">tasks finished</p>
        </div>
        <div className="bg-slate-950 p-5">
          <dt className="text-xs font-medium uppercase tracking-wider text-slate-600">Failed</dt>
          <dd className={`mt-2 text-2xl font-medium tracking-tight ${stats.failed > 0 ? "text-red-400" : "text-white"}`}>
            {stats.failed}
          </dd>
          <p className="mt-1 text-xs text-slate-600">errors</p>
        </div>
        <div className="bg-slate-950 p-5">
          <dt className="text-xs font-medium uppercase tracking-wider text-slate-600">Last heartbeat</dt>
          <dd className="mt-2 text-sm text-slate-300">{timeAgo(agent.last_heartbeat)}</dd>
        </div>
        <div className="bg-slate-950 p-5">
          <dt className="text-xs font-medium uppercase tracking-wider text-slate-600">Last connected</dt>
          <dd className="mt-2 text-sm text-slate-300">{timeAgo(agent.last_connected_at)}</dd>
        </div>
        <div className="bg-slate-950 p-5">
          <dt className="text-xs font-medium uppercase tracking-wider text-slate-600">Total tasks</dt>
          <dd className="mt-2 text-2xl font-medium tracking-tight text-white">{stats.total}</dd>
        </div>
      </div>

      {/* ── Tasks section ──────────────────────────────────── */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-white">Tasks</h2>
          <div className="flex items-center gap-0.5">
            {TASK_FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTaskFilter(opt.value)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  taskFilter === opt.value
                    ? "bg-slate-800 text-slate-200"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Count */}
        <p className="mt-3 text-xs text-slate-600">
          {filteredTasks.length} task{filteredTasks.length !== 1 && "s"}
          {hasTaskFilter && ` of ${tasks.length}`}
        </p>

        {/* Task list */}
        {filteredTasks.length === 0 ? (
          <div className="mt-10 text-center">
            {hasTaskFilter ? (
              <>
                <p className="text-sm text-slate-500">No tasks match this filter.</p>
                <button
                  onClick={() => setTaskFilter("ALL")}
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
                  <span> no tasks dispatched</span>
                </div>
                <p className="mt-2 text-xs text-slate-600">
                  Send a task to get started.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {filteredTasks.map((task) => {
              const ts = TASK_STATUS_STYLES[task.status];
              return (
                <div
                  key={task.id}
                  onClick={() => router.push(`/toony-agents/${agentId}/tasks/${task.id}`)}
                  className="group flex cursor-pointer items-center justify-between rounded-lg border border-slate-800/60 bg-slate-900 px-4 py-3 transition-all hover:border-slate-700/60"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${ts.bg}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${ts.dot}`} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-200 transition-colors group-hover:text-white">
                        {task.title}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-600">
                        {fmtDate(task.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-4 ml-4">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ts.bg} ${ts.text}`}>
                      {TASK_STATUS_LABELS[task.status]}
                    </span>
                    <svg
                      className="h-4 w-4 text-slate-700 transition-colors group-hover:text-slate-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────── */}
      <ManageKeysModal
        isOpen={showKeysModal}
        onClose={() => setShowKeysModal(false)}
        agentId={agentId}
      />
      <CreateTaskModal
        isOpen={showTaskModal}
        onClose={() => setShowTaskModal(false)}
        agentId={agentId}
        onSuccess={handleTaskCreated}
      />
    </div>
  );
}
