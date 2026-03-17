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
  ToonyAgentStatus,
  AgentTaskDetail,
  AgentTaskStatus,
  TaskEventItem,
  ToonyAgentWsEvent,
} from "@/types";
import type { ArtifactList } from "@/types/artifacts";

const TASK_STATUS_COLORS: Record<AgentTaskStatus, string> = {
  QUEUED: "bg-slate-500/15 text-slate-400",
  PAUSED: "bg-slate-500/15 text-slate-400",
  ASSIGNED: "bg-blue-500/15 text-blue-400",
  RUNNING: "bg-amber-500/15 text-amber-400",
  WAITING_FOR_ANSWER: "bg-purple-500/15 text-purple-400",
  COMPLETED: "bg-emerald-500/15 text-emerald-400",
  FAILED: "bg-red-500/15 text-red-400",
  CANCELLED: "bg-slate-500/15 text-slate-400",
};

const TASK_STATUS_LABELS: Record<AgentTaskStatus, string> = {
  QUEUED: "Queued",
  PAUSED: "Paused",
  ASSIGNED: "Assigned",
  RUNNING: "Running",
  WAITING_FOR_ANSWER: "Waiting for Answer",
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
  const [agentStatus, setAgentStatus] = useState<ToonyAgentStatus>("OFFLINE");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [events, setEvents] = useState<TaskEventItem[]>([]);
  const [answeredSequences, setAnsweredSequences] = useState<Set<number>>(
    new Set()
  );
  const [isLoading, setIsLoading] = useState(true);
  const [taskError, setTaskError] = useState<string | null>(null);
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
      setAgentStatus(agentData.status);
      setTask(taskData);
      setTaskStatus(taskData.status);
      setTaskError(taskData.error ?? null);
      setSessionId(taskData.session_id ?? null);
      setEvents(eventsData);

      // Mark already-answered questions
      const resolved = new Set<number>();
      const questionSequences: number[] = [];
      for (const ev of eventsData) {
        if (ev.event_type === "QUESTION_ASKED") {
          questionSequences.push(ev.sequence);
        }
        if (ev.event_type === "QUESTION_ANSWERED") {
          // The last question sequence before this answer
          if (questionSequences.length > 0) {
            resolved.add(questionSequences[questionSequences.length - 1]);
          }
        }
      }
      setAnsweredSequences(resolved);
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
      if (event.type === "agent.status") {
        setAgentStatus(event.status);
      } else if (event.type === "task.status" && event.task_id === taskId) {
        setTaskStatus(event.status);
        setTaskError(event.error ?? null);
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
        event.type === "question.asked" &&
        event.task_id === taskId
      ) {
        const newEvent: TaskEventItem = {
          id: `ws-question-${event.question_id}`,
          event_type: "QUESTION_ASKED",
          data: { question_id: event.question_id, question: event.question },
          sequence: event.sequence,
          created_at: new Date().toISOString(),
        };
        setEvents((prev) => {
          if (prev.some((e) => e.id === newEvent.id)) return prev;
          return [...prev, newEvent];
        });
        setTaskStatus("WAITING_FOR_ANSWER");
      }
    },
    [taskId]
  );

  const { sendAnswer, sendReply, cancelTask: wsCancelTask } =
    useToonyAgentWebSocket({
      agentId: agent?.id ?? null,
      onEvent: handleWsEvent,
    });

  // Handler for answering questions
  const handleAnswer = useCallback(
    (questionId: string, answer: string) => {
      sendAnswer(taskId, questionId, answer);
      // Find the sequence of this question to mark as answered
      const questionEvent = events.find(
        (e) => e.event_type === "QUESTION_ASKED" && (e.data as { question_id?: string }).question_id === questionId
      );
      if (questionEvent) {
        setAnsweredSequences((prev) => new Set(prev).add(questionEvent.sequence));
      }
    },
    [taskId, sendAnswer, events]
  );

  const handleMessage = useCallback(
    (text: string) => {
      if (taskStatus === "COMPLETED" && sessionId) {
        sendReply(taskId, text);
      }
    },
    [taskId, taskStatus, sessionId, sendReply]
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

  // Memoize answeredSequences as a Set for the child
  const answeredSequencesSet = useMemo(
    () => answeredSequences,
    [answeredSequences]
  );

  if (isLoading) {
    return <p className="text-slate-500">Loading...</p>;
  }

  if (!task) {
    return <p className="text-slate-500">Task not found.</p>;
  }

  const isActive =
    taskStatus === "RUNNING" || taskStatus === "WAITING_FOR_ANSWER";
  const isCancellable =
    taskStatus !== "COMPLETED" &&
    taskStatus !== "FAILED" &&
    taskStatus !== "CANCELLED";
  const canReply = taskStatus === "COMPLETED" && !!sessionId;
  const agentConnected = agentStatus !== "OFFLINE";

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
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="truncate text-lg font-medium tracking-tight text-white">
                {task.title}
              </h1>
              <span
                className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${TASK_STATUS_COLORS[taskStatus]}`}
              >
                {TASK_STATUS_LABELS[taskStatus]}
              </span>
            </div>
            {taskStatus === "FAILED" && taskError && (
              <p className="mt-1 text-sm text-red-400">{taskError}</p>
            )}
            {task.organization && (
              <div className="mt-1 font-mono text-xs text-slate-500">
                <span className="text-indigo-500">~</span>
                <span className="text-slate-700">/</span>
                {task.organization.name}
                {task.project && (
                  <>
                    <span className="text-slate-700">/</span>
                    {task.project.name}
                  </>
                )}
              </div>
            )}
          </div>
          {isCancellable && (
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
            prompt={task.prompt}
            events={events}
            taskStatus={taskStatus}
            onAnswer={handleAnswer}
            onMessage={handleMessage}
            answeredSequences={answeredSequencesSet}
            canReply={canReply}
            agentConnected={agentConnected}
          />
        </div>
      </div>
    </div>
  );
}
