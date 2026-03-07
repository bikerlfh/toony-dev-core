"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getToonyAgent,
  getAgentTask,
  listTaskEvents,
  cancelAgentTask,
} from "@/lib/api/toony-agents";
import { listAllArtifacts } from "@/lib/api/artifacts";
import { ArtifactStatusBadge } from "@/components/artifact-status-badge";
import { ArtifactTypeBadge } from "@/components/artifact-type-badge";
import { useToonyAgentWebSocket } from "@/hooks/use-toony-agent-websocket";
import { TaskPipelinePanel } from "@/components/toony-agents/task-pipeline-panel";
import { TaskLiveOutput } from "@/components/toony-agents/task-live-output";
import type {
  ToonyAgentDetail,
  AgentTaskDetail,
  AgentTaskStatus,
  TaskEventItem,
  ToonyAgentWsEvent,
} from "@/types";
import type { ArtifactList } from "@/types/artifacts";

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

export default function TaskViewPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;
  const taskId = params.taskId as string;

  const [agent, setAgent] = useState<ToonyAgentDetail | null>(null);
  const [task, setTask] = useState<AgentTaskDetail | null>(null);
  const [taskStatus, setTaskStatus] = useState<AgentTaskStatus>("QUEUED");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [events, setEvents] = useState<TaskEventItem[]>([]);
  const [approvedSequences, setApprovedSequences] = useState<Set<number>>(
    new Set()
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);
  const [taskArtifacts, setTaskArtifacts] = useState<ArtifactList[]>([]);

  // Fetch agent (need id for WS), task, and initial events
  const fetchData = useCallback(async () => {
    try {
      const [agentData, taskData, eventsData] = await Promise.all([
        getToonyAgent(agentId),
        getAgentTask(agentId, taskId),
        listTaskEvents(agentId, taskId),
      ]);
      setAgent(agentData);
      setTask(taskData);
      setTaskStatus(taskData.status);
      setSessionId(taskData.session_id ?? null);
      setEvents(eventsData.results);

      // Mark already-resolved approval gates
      const resolved = new Set<number>();
      const approvalSequences: number[] = [];
      for (const ev of eventsData.results) {
        if (ev.event_type === "APPROVAL_NEEDED") {
          approvalSequences.push(ev.sequence);
        }
        if (ev.event_type === "APPROVAL_RESPONSE") {
          // The last approval sequence before this response
          if (approvalSequences.length > 0) {
            resolved.add(approvalSequences[approvalSequences.length - 1]);
          }
        }
      }
      setApprovedSequences(resolved);
    } finally {
      setIsLoading(false);
    }
  }, [agentId, taskId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    listAllArtifacts({ agent_task_id: taskId }).then((res) => {
      setTaskArtifacts(res.results);
    });
  }, [taskId]);

  // WebSocket handler
  const handleWsEvent = useCallback(
    (event: ToonyAgentWsEvent) => {
      if (event.type === "task.status" && event.task_id === taskId) {
        setTaskStatus(event.status);
        if (event.session_id) {
          setSessionId(event.session_id);
        }
      } else if (event.type === "task.event" && event.task_id === taskId) {
        const newEvent: TaskEventItem = {
          id: `ws-${event.sequence}`,
          event_type: event.event_type,
          data: event.data,
          sequence: event.sequence,
          created_at: new Date().toISOString(),
        };
        setEvents((prev) => {
          // Avoid duplicates by id (not sequence — different event types can share a sequence number)
          if (prev.some((e) => e.id === newEvent.id)) return prev;
          return [...prev, newEvent];
        });
      } else if (
        event.type === "approval.needed" &&
        event.task_id === taskId
      ) {
        // Also append as a task event if not already present via task.event
        const newEvent: TaskEventItem = {
          id: `ws-approval-${event.sequence}`,
          event_type: "APPROVAL_NEEDED",
          data: event.data as Record<string, unknown>,
          sequence: event.sequence,
          created_at: new Date().toISOString(),
        };
        setEvents((prev) => {
          if (prev.some((e) => e.id === newEvent.id)) return prev;
          return [...prev, newEvent];
        });
      }
    },
    [taskId]
  );

  const { sendApproval, sendReply, cancelTask: wsCancelTask } =
    useToonyAgentWebSocket({
      agentId: agent?.id ?? null,
      onEvent: handleWsEvent,
    });

  // Handlers for approval gates
  const handleApprove = useCallback(
    (sequence: number) => {
      sendApproval(taskId, "approve", "");
      setApprovedSequences((prev) => new Set(prev).add(sequence));
    },
    [taskId, sendApproval]
  );

  const handleReject = useCallback(
    (sequence: number) => {
      sendApproval(taskId, "reject", "");
      setApprovedSequences((prev) => new Set(prev).add(sequence));
    },
    [taskId, sendApproval]
  );

  const handleMessage = useCallback(
    (text: string) => {
      if (taskStatus === "COMPLETED" && sessionId) {
        sendReply(taskId, text);
      } else {
        sendApproval(taskId, "message", text);
      }
    },
    [taskId, taskStatus, sessionId, sendApproval, sendReply]
  );

  // Cancel task via REST API
  async function handleCancelTask() {
    setIsCancelling(true);
    try {
      await cancelAgentTask(agentId, taskId);
      setTaskStatus("CANCELLED");
    } catch {
      // Also try WS cancel
      wsCancelTask(taskId);
    } finally {
      setIsCancelling(false);
    }
  }

  // Memoize approvedSequences as a Set for the child
  const approvedSequencesSet = useMemo(
    () => approvedSequences,
    [approvedSequences]
  );

  if (isLoading) {
    return <p className="text-slate-500">Loading...</p>;
  }

  if (!task) {
    return <p className="text-slate-500">Task not found.</p>;
  }

  const isActive =
    taskStatus === "RUNNING" || taskStatus === "AWAITING_APPROVAL";
  const canReply = taskStatus === "COMPLETED" && !!sessionId;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-slate-800 px-4 py-3">
        <button
          onClick={() => router.back()}
          className="mb-2 text-sm text-slate-500 transition-colors hover:text-slate-300"
        >
          &larr; Back
        </button>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-medium tracking-tight text-white">
              {task.title}
            </h1>
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TASK_STATUS_COLORS[taskStatus]}`}
            >
              {TASK_STATUS_LABELS[taskStatus]}
            </span>
          </div>
          {isActive && (
            <button
              onClick={handleCancelTask}
              disabled={isCancelling}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
            >
              {isCancelling ? "Cancelling..." : "Cancel Task"}
            </button>
          )}
        </div>
      </div>

      {taskArtifacts.length > 0 && (
        <div className="flex-shrink-0 border-b border-slate-800 px-4 py-3">
          <h3 className="mb-2 text-xs font-medium uppercase text-slate-500">Artifacts</h3>
          <div className="space-y-2">
            {taskArtifacts.map((a) => (
              <div
                key={a.id}
                onClick={() => router.push(`/artifacts/${a.id}`)}
                className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-800/60 bg-slate-900 px-3 py-2 transition-colors hover:border-slate-700/60"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-200">{a.title}</span>
                  <ArtifactTypeBadge type={a.artifact_type} />
                </div>
                <ArtifactStatusBadge status={a.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Split layout */}
      <div className="flex flex-1 min-h-0">
        {/* Pipeline panel (25%) */}
        <div className="w-1/4 flex-shrink-0">
          <TaskPipelinePanel events={events} taskStatus={taskStatus} />
        </div>

        {/* Live output (75%) */}
        <div className="flex-1 min-w-0">
          <TaskLiveOutput
            events={events}
            taskStatus={taskStatus}
            onApprove={handleApprove}
            onReject={handleReject}
            onMessage={handleMessage}
            approvedSequences={approvedSequencesSet}
            canReply={canReply}
          />
        </div>
      </div>
    </div>
  );
}
