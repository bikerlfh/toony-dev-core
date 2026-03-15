"use client";

import { useState, useEffect, useCallback } from "react";
import type { AgentTaskByIssueItem, AgentTaskStatus } from "@/types";
import { listAgentTasksByIssue } from "@/lib/api/toony-agents";

const TASK_STATUS_COLORS: Record<AgentTaskStatus, string> = {
  QUEUED: "bg-slate-500/15 text-slate-400",
  ASSIGNED: "bg-blue-500/15 text-blue-400",
  RUNNING: "bg-amber-500/15 text-amber-400",
  WAITING_FOR_ANSWER: "bg-purple-500/15 text-purple-400",
  COMPLETED: "bg-emerald-500/15 text-emerald-400",
  FAILED: "bg-red-500/15 text-red-400",
  CANCELLED: "bg-slate-500/15 text-slate-400",
};

const TASK_STATUS_LABELS: Record<AgentTaskStatus, string> = {
  QUEUED: "Queued",
  ASSIGNED: "Assigned",
  RUNNING: "Running",
  WAITING_FOR_ANSWER: "Waiting",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

interface IssueAgentTasksProps {
  issueId: string;
}

export function IssueAgentTasks({ issueId }: IssueAgentTasksProps) {
  const [tasks, setTasks] = useState<AgentTaskByIssueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    try {
      const data = await listAgentTasksByIssue(issueId);
      setTasks(data.results);
    } finally {
      setIsLoading(false);
    }
  }, [issueId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-500" />
      </div>
    );
  }

  if (tasks.length === 0) return null;

  return (
    <div>
      <h3 className="mb-2 text-xs font-medium uppercase text-slate-500">
        Agent Tasks
      </h3>
      <div className="space-y-1.5">
        {tasks.map((task) => (
          <button
            key={task.id}
            onClick={() => {
              if (task.toony_agent) {
                window.open(
                  `/toony-agents/${task.toony_agent.id}/tasks/${task.id}`,
                  "_blank"
                );
              }
            }}
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-slate-800/60 bg-slate-900 px-3 py-2 text-left transition-colors hover:border-slate-700/60"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs text-slate-200">
                {task.title}
              </div>
              {task.toony_agent && (
                <div className="mt-0.5 text-[10px] text-slate-500">
                  {task.toony_agent.name}
                </div>
              )}
            </div>
            <span
              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${TASK_STATUS_COLORS[task.status]}`}
            >
              {TASK_STATUS_LABELS[task.status]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
