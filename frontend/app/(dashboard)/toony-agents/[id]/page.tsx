"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getToonyAgent, listAgentTasks, updateToonyAgent } from "@/lib/api/toony-agents";
import { listOrganizations } from "@/lib/api/organizations";
import { ConfirmModal } from "@/components/confirm-modal";
import { useToonyAgentWebSocket } from "@/hooks/use-toony-agent-websocket";
import { ManageKeysModal } from "@/components/toony-agents/manage-keys-modal";
import { CreateTaskModal } from "@/components/toony-agents/create-task-modal";
import { Select } from "@/components/ui/select";
import type {
  ToonyAgentDetail,
  AgentTaskList,
  AgentTaskStatus,
  ToonyAgentStatus,
  ToonyAgentWsEvent,
  Organization,
} from "@/types";

/* ── Status config ────────────────────────────────────── */

const AGENT_STATUS_STYLES: Record<ToonyAgentStatus, { dot: string; border: string; text: string }> = {
  ONLINE: { dot: "bg-emerald-400", border: "border-emerald-500/20 bg-emerald-500/10", text: "text-emerald-400" },
  BUSY: { dot: "bg-blue-400", border: "border-blue-500/20 bg-blue-500/10", text: "text-blue-400" },
  OFFLINE: { dot: "bg-slate-600", border: "border-slate-700 bg-slate-800", text: "text-slate-500" },
};

const TASK_STATUS_STYLES: Record<AgentTaskStatus, { dot: string; text: string; bg: string }> = {
  QUEUED: { dot: "bg-slate-500", text: "text-slate-400", bg: "bg-slate-500/15" },
  PAUSED: { dot: "bg-slate-500", text: "text-slate-400", bg: "bg-slate-500/15" },
  ASSIGNED: { dot: "bg-blue-400", text: "text-blue-400", bg: "bg-blue-500/15" },
  RUNNING: { dot: "bg-amber-400", text: "text-amber-400", bg: "bg-amber-500/15" },
  WAITING_FOR_ANSWER: { dot: "bg-purple-400", text: "text-purple-400", bg: "bg-purple-500/15" },
  COMPLETED: { dot: "bg-emerald-400", text: "text-emerald-400", bg: "bg-emerald-500/15" },
  FAILED: { dot: "bg-red-400", text: "text-red-400", bg: "bg-red-500/15" },
  CANCELLED: { dot: "bg-slate-500", text: "text-slate-400", bg: "bg-slate-500/15" },
};

const TASK_STATUS_LABELS: Record<AgentTaskStatus, string> = {
  QUEUED: "Queued",
  PAUSED: "Paused",
  ASSIGNED: "Assigned",
  RUNNING: "Running",
  WAITING_FOR_ANSWER: "Waiting",
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

const ACTIVE_STATUSES: AgentTaskStatus[] = ["QUEUED", "ASSIGNED", "RUNNING", "WAITING_FOR_ANSWER"];

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

function fmtTimeout(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
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
  const [showAddOrgModal, setShowAddOrgModal] = useState(false);
  const [allOrgs, setAllOrgs] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [addOrgLoading, setAddOrgLoading] = useState(false);
  const [removeOrgAgent, setRemoveOrgAgent] = useState<{ id: string; name: string } | null>(null);
  const [removeOrgLoading, setRemoveOrgLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState("");

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

  const fetchAvailableOrgs = useCallback(async () => {
    try {
      const res = await listOrganizations();
      setAllOrgs(res.results);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchAgent();
    fetchTasks();
    fetchAvailableOrgs();
  }, [fetchAgent, fetchTasks, fetchAvailableOrgs]);

  /* ── WebSocket ────────────────────────────────────────── */

  const handleWsEvent = useCallback(
    (event: ToonyAgentWsEvent) => {
      if (event.type === "agent.status") {
        setAgent((prev) =>
          prev
            ? {
                ...prev,
                status: event.status as ToonyAgentStatus,
                ...(event.metadata ? { metadata: event.metadata } : {}),
              }
            : prev
        );
      } else if (event.type === "task.status") {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === event.task_id ? { ...t, status: event.status as AgentTaskStatus } : t
          )
        );
      } else if (event.type === "config.sync.status") {
        setSyncLoading(false);
        if (event.success) {
          setSyncResult({
            success: true,
            message: `Synced ${event.org_count} org(s), ${event.project_count} project(s)`,
          });
        } else {
          setSyncResult({
            success: false,
            message: event.error || "Sync failed",
          });
        }
        setTimeout(() => setSyncResult(null), 5000);
      } else if (event.type === "config.update.status") {
        setSettingsSaving(false);
        if (event.success) {
          setAgent((prev) =>
            prev && event.metadata ? { ...prev, metadata: event.metadata } : prev
          );
          setShowSettingsModal(false);
          setSettingsError("");
        } else {
          setSettingsError(event.error || "Update failed");
        }
      }
    },
    []
  );

  const { readyState, sendAnswer, sendReply, cancelTask, sendConfigSync, sendConfigUpdate } =
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

  const availableOrgs = useMemo(() => {
    if (!agent) return [];
    const assignedIds = new Set(agent.organizations.map((o) => o.id));
    return allOrgs.filter((o) => !assignedIds.has(o.id));
  }, [allOrgs, agent]);

  async function handleAddOrg() {
    if (!agent || !selectedOrgId) return;
    setAddOrgLoading(true);
    try {
      const newIds = [...agent.organizations.map((o) => o.id), selectedOrgId];
      await updateToonyAgent(agentId, { organization_ids: newIds });
      await fetchAgent();
      setShowAddOrgModal(false);
      setSelectedOrgId("");
    } catch {
      // silent
    } finally {
      setAddOrgLoading(false);
    }
  }

  async function handleRemoveOrg() {
    if (!agent || !removeOrgAgent) return;
    setRemoveOrgLoading(true);
    try {
      const newIds = agent.organizations
        .filter((o) => o.id !== removeOrgAgent.id)
        .map((o) => o.id);
      await updateToonyAgent(agentId, { organization_ids: newIds });
      await fetchAgent();
      setRemoveOrgAgent(null);
    } catch {
      // silent
    } finally {
      setRemoveOrgLoading(false);
    }
  }

  /* ── Loading ──────────────────────────────────────────── */

  if (isLoading) {
    return (
      <div>
        <div className="h-4 w-24 animate-pulse rounded bg-slate-800" />
        <div className="mt-6 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-pulse rounded-lg bg-slate-800/60" />
            <div>
              <div className="h-5 w-40 animate-pulse rounded bg-slate-800" />
              <div className="mt-2 h-3.5 w-24 animate-pulse rounded bg-slate-800/60" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-24 animate-pulse rounded-lg bg-slate-800" />
            <div className="h-9 w-28 animate-pulse rounded-lg bg-slate-800/60" />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-4 gap-px overflow-hidden rounded-xl border border-slate-800/60 bg-slate-800/30">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[84px] animate-pulse bg-slate-950" />
          ))}
        </div>
        <div className="mt-8 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[60px] animate-pulse rounded-lg border border-slate-800/60 bg-slate-900" />
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
      <div className="mb-6">
        <Link
          href="/toony-agents"
          className="text-sm text-slate-500 transition-colors hover:text-slate-300"
        >
          &larr; Toony Agents
        </Link>
      </div>

      {/* ── Agent header ──────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-800/60">
            <svg
              className="h-5 w-5 text-indigo-400"
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
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="truncate text-xl font-medium tracking-tight text-white">{agent.name}</h1>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusStyle.border} ${statusStyle.text}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
                {agent.status.charAt(0) + agent.status.slice(1).toLowerCase()}
              </span>
            </div>
            <span className="mt-1 inline-block font-mono text-sm text-slate-500">{agent.slug}</span>
            <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
              <span>
                Registered by {agent.registered_by.first_name} {agent.registered_by.last_name}
              </span>
              <span className="text-slate-800">|</span>
              <span className="flex items-center gap-1.5">
                <svg className="h-3 w-3 text-slate-600" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1.5 8h2.25l1.5-3.5 2.5 7 2.5-7 1.5 3.5h2.75" />
                </svg>
                {timeAgo(agent.last_heartbeat)}
              </span>
              <span className="text-slate-800">|</span>
              <span>Last seen {timeAgo(agent.last_connected_at)}</span>
              {typeof agent.metadata?.max_concurrent_tasks === "number" && (
                <>
                  <span className="text-slate-800">|</span>
                  <span>Concurrency: {agent.metadata.max_concurrent_tasks}</span>
                </>
              )}
              {typeof agent.metadata?.max_task_timeout === "number" && (
                <>
                  <span className="text-slate-800">|</span>
                  <span>Timeout: {fmtTimeout(agent.metadata.max_task_timeout as number)}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {agent.status !== "OFFLINE" && (
            <>
              <button
                onClick={() => {
                  setSyncLoading(true);
                  setSyncResult(null);
                  sendConfigSync();
                }}
                disabled={syncLoading}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-slate-600 hover:text-white disabled:opacity-50"
              >
                {syncLoading ? "Syncing..." : "Sync Config"}
              </button>
              <button
                onClick={() => setShowSettingsModal(true)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-slate-600 hover:text-white"
              >
                Runner Settings
              </button>
            </>
          )}
          <Link
            href={`/toony-agents/${agentId}/events`}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-slate-600 hover:text-white"
          >
            System Events
          </Link>
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

      {syncResult && (
        <div
          className={`mt-3 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm ${
            syncResult.success
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
              : "border-red-500/20 bg-red-500/10 text-red-400"
          }`}
        >
          <span>{syncResult.success ? "Synced" : "Failed"}:</span>
          <span className="text-slate-300">{syncResult.message}</span>
        </div>
      )}

      {/* ── Organizations ─────────────────────────────────── */}
      <div className="mt-6">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-medium text-white">Organizations</h2>
          <span className="text-xs text-slate-600">
            {agent.organizations.length}
          </span>
          <button
            onClick={() => setShowAddOrgModal(true)}
            className="ml-auto rounded-md border border-slate-800/60 px-2.5 py-1 text-xs font-medium text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-200"
          >
            + Add
          </button>
        </div>

        {agent.organizations.length === 0 ? (
          <div className="mt-4">
            <div className="font-mono text-sm text-slate-500">
              <span className="text-indigo-500">~</span>
              <span className="text-slate-600">/</span>
              <span> no organizations assigned</span>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {agent.organizations.map((org) => (
              <div
                key={org.id}
                className="group flex items-center gap-2 rounded-lg border border-slate-800/60 bg-slate-900 py-1.5 pl-3 pr-2 transition-colors hover:border-slate-700/60"
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium text-slate-200">{org.name}</span>
                  <span className="ml-2 font-mono text-xs text-slate-600">{org.slug}</span>
                </div>
                <button
                  onClick={() => setRemoveOrgAgent({ id: org.id, name: org.name })}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-600 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                >
                  <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Metrics strip ─────────────────────────────────── */}
      <div className="mt-6 grid grid-cols-4 gap-px overflow-hidden rounded-xl border border-slate-800/60 bg-slate-800/30">
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
          <dt className="text-xs font-medium uppercase tracking-wider text-slate-600">Total</dt>
          <dd className="mt-2 text-2xl font-medium tracking-tight text-white">
            {stats.total}
          </dd>
          <p className="mt-1 text-xs text-slate-600">tasks dispatched</p>
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

        <p className="mt-3 text-xs text-slate-600">
          {filteredTasks.length} task{filteredTasks.length !== 1 && "s"}
          {hasTaskFilter && ` of ${tasks.length}`}
        </p>

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
          <div className="mt-3 space-y-1.5">
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
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-600">
                        <span>{fmtDate(task.created_at)}</span>
                        {task.organization && (
                          <>
                            <span className="text-slate-800">·</span>
                            <span className="font-mono text-slate-500">
                              <span className="text-indigo-500">~</span>
                              <span className="text-slate-700">/</span>
                              {task.organization.name}
                              {task.project && (
                                <>
                                  <span className="text-slate-700">/</span>
                                  {task.project.name}
                                </>
                              )}
                            </span>
                          </>
                        )}
                      </div>
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
        organizations={agent.organizations}
        onSuccess={handleTaskCreated}
      />

      {/* ── Add Organization Modal ─────────────────────────── */}
      {showAddOrgModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowAddOrgModal(false); setSelectedOrgId(""); } }}
        >
          <div className="w-full max-w-sm rounded-xl border border-slate-800/60 bg-slate-900 p-6">
            <h2 className="text-base font-medium tracking-tight text-white">Add Organization</h2>
            <p className="mt-1 text-sm text-slate-500">Select an organization to assign this agent to.</p>
            <Select
              options={[
                { value: "", label: "Select organization..." },
                ...availableOrgs.map((o) => ({ value: o.id, label: o.name })),
              ]}
              value={selectedOrgId}
              onChange={(v) => setSelectedOrgId(v)}
              placeholder="Select organization..."
              className="mt-4"
            />
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setShowAddOrgModal(false); setSelectedOrgId(""); }}
                className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddOrg}
                disabled={!selectedOrgId || addOrgLoading}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
              >
                {addOrgLoading ? "Adding..." : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Remove Organization Confirm ────────────────────── */}
      {removeOrgAgent && (
        <ConfirmModal
          title="Remove Organization"
          message={`Remove "${removeOrgAgent.name}" from this agent? The agent will no longer be accessible to members of that organization.`}
          confirmLabel="Remove"
          confirmVariant="danger"
          isLoading={removeOrgLoading}
          onConfirm={handleRemoveOrg}
          onCancel={() => setRemoveOrgAgent(null)}
        />
      )}

      {/* ── Runner Settings Modal ─────────────────────────── */}
      {showSettingsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowSettingsModal(false);
              setSettingsError("");
            }
          }}
        >
          <div className="w-full max-w-sm rounded-xl border border-slate-800/60 bg-slate-900 p-6">
            <h2 className="text-base font-medium tracking-tight text-white">
              Runner Settings
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Update runner configuration. Changes apply immediately.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const concurrency = parseInt(
                  (form.elements.namedItem("concurrency") as HTMLInputElement).value,
                  10
                );
                const timeoutMin = parseInt(
                  (form.elements.namedItem("timeout") as HTMLInputElement).value,
                  10
                );
                if (isNaN(concurrency) || concurrency < 1 || concurrency > 100) return;
                if (isNaN(timeoutMin) || timeoutMin < 1 || timeoutMin > 480) return;
                setSettingsSaving(true);
                setSettingsError("");
                sendConfigUpdate({
                  max_concurrent_tasks: concurrency,
                  max_task_timeout: timeoutMin * 60,
                });
              }}
            >
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300">
                    Max Concurrent Tasks
                  </label>
                  <input
                    name="concurrency"
                    type="number"
                    min={1}
                    max={100}
                    defaultValue={
                      typeof agent.metadata?.max_concurrent_tasks === "number"
                        ? agent.metadata.max_concurrent_tasks
                        : 1
                    }
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <p className="mt-1 text-xs text-slate-600">1–100 concurrent tasks</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300">
                    Task Timeout
                  </label>
                  <input
                    name="timeout"
                    type="number"
                    min={1}
                    max={480}
                    defaultValue={
                      typeof agent.metadata?.max_task_timeout === "number"
                        ? Math.round((agent.metadata.max_task_timeout as number) / 60)
                        : 60
                    }
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <p className="mt-1 text-xs text-slate-600">1–480 minutes per task</p>
                </div>
              </div>
              {settingsError && (
                <p className="mt-3 text-sm text-red-400">{settingsError}</p>
              )}
              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowSettingsModal(false);
                    setSettingsError("");
                  }}
                  className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settingsSaving}
                  className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                >
                  {settingsSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
