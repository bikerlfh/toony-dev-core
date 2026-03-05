"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getToonyAgent, listAgentTasks } from "@/lib/api/toony-agents";
// Role checks removed — will be re-implemented when org context is rebuilt
import { useToonyAgentWebSocket } from "@/hooks/use-toony-agent-websocket";
import { ToonyAgentStatusBadge } from "@/components/toony-agents/toony-agent-status-badge";
import { ManageKeysModal } from "@/components/toony-agents/manage-keys-modal";
import { CreateTaskModal } from "@/components/toony-agents/create-task-modal";
import type {
  ToonyAgentDetail,
  AgentTaskList,
  AgentTaskStatus,
  ToonyAgentStatus,
  ToonyAgentWsEvent,
} from "@/types";

const TASK_STATUS_COLORS: Record<AgentTaskStatus, string> = {
  QUEUED: "bg-slate-500/15 text-slate-400",
  ASSIGNED: "bg-blue-500/15 text-blue-400",
  RUNNING: "bg-amber-500/15 text-amber-400",
  AWAITING_APPROVAL: "bg-purple-500/15 text-purple-400",
  COMPLETED: "bg-emerald-500/15 text-emerald-400",
  FAILED: "bg-red-500/15 text-red-400",
  CANCELLED: "bg-slate-500/15 text-slate-400",
};

const TASK_STATUS_LABELS: Record<AgentTaskStatus, string> = {
  QUEUED: "Queued",
  ASSIGNED: "Assigned",
  RUNNING: "Running",
  AWAITING_APPROVAL: "Awaiting Approval",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function ToonyAgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;

  const [agent, setAgent] = useState<ToonyAgentDetail | null>(null);
  const [tasks, setTasks] = useState<AgentTaskList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showKeysModal, setShowKeysModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);

  // Role checks temporarily set to true — will be re-implemented when org context is rebuilt
  const canManage = true;

  const fetchAgent = useCallback(async () => {
    try {
      const data = await getToonyAgent(agentId);
      setAgent(data);
    } finally {
      setIsLoading(false);
    }
  }, [agentId]);

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

  // WebSocket handler
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

  function handleTaskCreated(taskId: string) {
    router.push(`/toony-agents/${agentId}/tasks/${taskId}`);
  }

  if (isLoading) {
    return <p className="text-slate-500">Loading...</p>;
  }

  if (!agent) {
    return <p className="text-slate-500">Agent not found.</p>;
  }

  return (
    <div>
      {/* Back link */}
      <button
        onClick={() => router.push(`/toony-agents`)}
        className="mb-4 text-sm text-slate-500 transition-colors hover:text-slate-300"
      >
        &larr; Back to Toony Agents
      </button>

      {/* Agent header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-medium tracking-tight text-white">{agent.name}</h1>
            <ToonyAgentStatusBadge status={agent.status} />
          </div>
          <div className="mt-2 flex items-center gap-4 text-sm text-slate-500">
            <span>Last connected: {timeAgo(agent.last_connected_at)}</span>
            <span>
              Registered by: {agent.registered_by.first_name} {agent.registered_by.last_name}
            </span>
          </div>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowTaskModal(true)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
            >
              + New Task
            </button>
            <button
              onClick={() => setShowKeysModal(true)}
              className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white"
            >
              Manage Keys
            </button>
          </div>
        )}
      </div>

      {/* Tasks table */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-slate-200">Tasks</h2>

        {tasks.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No tasks yet.</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-800/60">
            <table className="min-w-full divide-y divide-slate-800/60">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Started</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {tasks.map((task) => (
                  <tr
                    key={task.id}
                    onClick={() => router.push(`/toony-agents/${agentId}/tasks/${task.id}`)}
                    className="cursor-pointer hover:bg-slate-900/60"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-200">
                      {task.title}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TASK_STATUS_COLORS[task.status]}`}>
                        {TASK_STATUS_LABELS[task.status]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-400">
                      {formatDateTime(task.started_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-400">
                      {formatDateTime(task.completed_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
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
