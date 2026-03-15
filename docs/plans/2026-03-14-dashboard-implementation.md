# Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a personal dashboard at `frontend/app/(dashboard)/page.tsx` showing the user's issues, agent tasks, projects, Toony agents, workflows, and artifacts in a main-column + sidebar layout with a stats row.

**Architecture:** Single `"use client"` page component with parallel data fetching via `Promise.all`. Data from 4 API calls: `listAllIssues`, `listToonyAgents` + `listAgentTasks` per agent, `listProjects`, `listWorkflows`, `listAllArtifacts`. Client-side filtering with `useMemo`. Reuses existing badge components and `IssueSidePanel`.

**Tech Stack:** React 19, Next.js 15 App Router, Tailwind CSS v4, TypeScript, Axios

---

### Task 1: Create the `timeAgo` utility

**Files:**
- Create: `frontend/lib/time.ts`

**Step 1: Write the utility**

```typescript
export function timeAgo(dateString: string | null): string {
  if (!dateString) return "Never";
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
```

**Step 2: Commit**

```bash
git add frontend/lib/time.ts
git commit -m "feat(frontend): add timeAgo utility for relative timestamps"
```

---

### Task 2: Create the `IssueStatusBadge` component

The issue status colors/labels are currently inlined in `issue-side-panel.tsx`. Extract them into a reusable component.

**Files:**
- Create: `frontend/components/issue-status-badge.tsx`

**Step 1: Write the component**

```tsx
import type { IssueStatus } from "@/types";

const ISSUE_STATUS_COLORS: Record<IssueStatus, string> = {
  BACKLOG: "bg-slate-800 text-slate-400",
  TODO: "bg-blue-500/15 text-blue-400",
  IN_PROGRESS: "bg-amber-500/15 text-amber-400",
  IN_REVIEW: "bg-purple-500/15 text-purple-400",
  DONE: "bg-emerald-500/15 text-emerald-400",
  CANCELED: "bg-red-500/15 text-red-400",
};

const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  BACKLOG: "Backlog",
  TODO: "Todo",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
  DONE: "Done",
  CANCELED: "Canceled",
};

export function IssueStatusBadge({ status }: { status: IssueStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ISSUE_STATUS_COLORS[status]}`}
    >
      {ISSUE_STATUS_LABELS[status]}
    </span>
  );
}
```

**Step 2: Update `issue-side-panel.tsx` to use the new component**

In `frontend/components/tasks/issue-side-panel.tsx`:
- Remove the `ISSUE_STATUS_COLORS` and `ISSUE_STATUS_LABELS` constants (lines 11-27)
- Import and use `IssueStatusBadge` instead of the inline `<span>` at line 91-94

Replace the inline badge:
```tsx
<span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ISSUE_STATUS_COLORS[issue.status]}`}>
  {ISSUE_STATUS_LABELS[issue.status]}
</span>
```
with:
```tsx
<IssueStatusBadge status={issue.status} />
```

**Step 3: Verify the build**

Run: `cd frontend && ./node_modules/.bin/next build`
Expected: Build succeeds with no errors.

**Step 4: Commit**

```bash
git add frontend/components/issue-status-badge.tsx frontend/components/tasks/issue-side-panel.tsx
git commit -m "refactor(frontend): extract IssueStatusBadge into reusable component"
```

---

### Task 3: Build the dashboard page — data fetching layer

**Files:**
- Modify: `frontend/app/(dashboard)/page.tsx`

**Step 1: Write the page with all data fetching, state, and computed values**

Replace the entire file with:

```tsx
"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import type {
  CrossProjectIssueList,
  ProjectList,
  IssueStatus,
} from "@/types";
import type { ToonyAgentList, AgentTaskList } from "@/types/toony-agents";
import type { WorkflowList } from "@/types/workflows";
import type { ArtifactList } from "@/types/artifacts";
import { useAuth } from "@/contexts/auth-context";
import { listAllIssues } from "@/lib/api/issues";
import { listProjects } from "@/lib/api/projects";
import { listToonyAgents, listAgentTasks } from "@/lib/api/toony-agents";
import { listWorkflows } from "@/lib/api/workflows";
import { listAllArtifacts } from "@/lib/api/artifacts";
import { PriorityBadge } from "@/components/priority-badge";
import { StatusBadge } from "@/components/status-badge";
import { IssueStatusBadge } from "@/components/issue-status-badge";
import { ArtifactTypeBadge } from "@/components/artifact-type-badge";
import { ArtifactStatusBadge } from "@/components/artifact-status-badge";
import { IssueSidePanel } from "@/components/tasks/issue-side-panel";
import { timeAgo } from "@/lib/time";

const PRIORITY_ORDER: Record<string, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  NONE: 4,
};

const TASK_STATUS_COLORS: Record<string, string> = {
  RUNNING: "bg-amber-400",
  QUEUED: "bg-slate-400",
  ASSIGNED: "bg-blue-400",
  WAITING_FOR_ANSWER: "bg-purple-400",
  COMPLETED: "bg-emerald-400",
  FAILED: "bg-red-400",
  CANCELLED: "bg-slate-500",
  PAUSED: "bg-orange-400",
};

const TASK_STATUS_LABELS: Record<string, string> = {
  RUNNING: "Running",
  QUEUED: "Queued",
  ASSIGNED: "Assigned",
  WAITING_FOR_ANSWER: "Waiting",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  PAUSED: "Paused",
};

const AGENT_STATUS_DOT: Record<string, string> = {
  ONLINE: "bg-emerald-400",
  BUSY: "bg-amber-400",
  OFFLINE: "bg-slate-500",
};

type IssueFilter = "ALL" | "IN_PROGRESS" | "TODO" | "IN_REVIEW" | "BACKLOG";
type TaskFilter = "ALL" | "RUNNING" | "QUEUED" | "COMPLETED" | "FAILED";

export default function DashboardPage() {
  const { user } = useAuth();

  // ── State ──
  const [issues, setIssues] = useState<CrossProjectIssueList[]>([]);
  const [agents, setAgents] = useState<ToonyAgentList[]>([]);
  const [agentTasks, setAgentTasks] = useState<(AgentTaskList & { agent_name: string })[]>([]);
  const [projects, setProjects] = useState<ProjectList[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowList[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactList[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // ── Filters ──
  const [issueFilter, setIssueFilter] = useState<IssueFilter>("ALL");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("ALL");

  // ── Side panel ──
  const [selectedIssue, setSelectedIssue] = useState<{
    projectId: string;
    issueId: string;
  } | null>(null);

  // ── Fetch all data ──
  const fetchData = useCallback(async () => {
    try {
      const [issuesRes, agentsRes, projectsRes, workflowsRes, artifactsRes] =
        await Promise.all([
          listAllIssues(),
          listToonyAgents(),
          listProjects(),
          listWorkflows(),
          listAllArtifacts(),
        ]);

      setIssues(issuesRes.results);
      setAgents(agentsRes.results);
      setProjects(projectsRes.results);
      setWorkflows(workflowsRes.results);
      setArtifacts(artifactsRes.results);

      // Fetch tasks for all agents in parallel
      const allAgents = agentsRes.results;
      if (allAgents.length > 0) {
        const taskResults = await Promise.all(
          allAgents.map((a) => listAgentTasks(a.id))
        );
        const merged = allAgents.flatMap((agent, i) =>
          taskResults[i].results.map((t) => ({
            ...t,
            agent_name: agent.name,
          }))
        );
        setAgentTasks(merged);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Computed: My issues (assigned to me, not done/canceled) ──
  const myIssues = useMemo(() => {
    if (!user) return [];
    return issues
      .filter(
        (i) =>
          i.assignee?.id === user.id &&
          i.status !== "DONE" &&
          i.status !== "CANCELED"
      )
      .sort(
        (a, b) =>
          (PRIORITY_ORDER[a.priority] ?? 4) -
          (PRIORITY_ORDER[b.priority] ?? 4)
      );
  }, [issues, user]);

  const filteredIssues = useMemo(() => {
    if (issueFilter === "ALL") return myIssues;
    return myIssues.filter((i) => i.status === issueFilter);
  }, [myIssues, issueFilter]);

  // ── Computed: Agent tasks sorted ──
  const sortedTasks = useMemo(() => {
    const active = ["RUNNING", "QUEUED", "ASSIGNED", "WAITING_FOR_ANSWER", "PAUSED"];
    return [...agentTasks].sort((a, b) => {
      const aActive = active.includes(a.status) ? 0 : 1;
      const bActive = active.includes(b.status) ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [agentTasks]);

  const filteredTasks = useMemo(() => {
    if (taskFilter === "ALL") return sortedTasks;
    return sortedTasks.filter((t) => t.status === taskFilter);
  }, [sortedTasks, taskFilter]);

  const taskCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of agentTasks) {
      counts[t.status] = (counts[t.status] || 0) + 1;
    }
    return counts;
  }, [agentTasks]);

  // ── Computed: Projects sorted ──
  const sortedProjects = useMemo(() => {
    const statusOrder: Record<string, number> = {
      IN_PROGRESS: 0,
      PLANNED: 1,
      BACKLOG: 2,
      PAUSED: 3,
      COMPLETED: 4,
      CANCELED: 5,
    };
    return [...projects].sort(
      (a, b) =>
        (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5)
    );
  }, [projects]);

  // ── Computed: Active workflows ──
  const activeWorkflows = useMemo(
    () => workflows.filter((w) => w.is_active).slice(0, 5),
    [workflows]
  );

  // ── Computed: Recent artifacts ──
  const recentArtifacts = useMemo(
    () =>
      [...artifacts]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
        )
        .slice(0, 5),
    [artifacts]
  );

  // ── Stats ──
  const stats = useMemo(() => {
    const openIssues = myIssues.length;
    const urgentHigh = myIssues.filter(
      (i) => i.priority === "URGENT" || i.priority === "HIGH"
    ).length;
    const agentsOnline = agents.filter((a) => a.status === "ONLINE").length;
    const tasksRunning = agentTasks.filter(
      (t) => t.status === "RUNNING"
    ).length;
    const tasksQueued = agentTasks.filter(
      (t) => t.status === "QUEUED"
    ).length;

    return { openIssues, urgentHigh, agentsOnline, agentsTotal: agents.length, tasksRunning, tasksQueued };
  }, [myIssues, agents, agentTasks]);

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-500" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-medium tracking-tight text-white">
        Dashboard
      </h1>

      {/* ── Stats Row ── */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-800/60 bg-slate-900 p-4">
          <p className="text-2xl font-semibold text-white">{stats.openIssues}</p>
          <p className="mt-1 text-sm text-slate-400">My Open Issues</p>
        </div>
        <div className="rounded-xl border border-slate-800/60 bg-slate-900 p-4">
          <p className="text-2xl font-semibold text-orange-400">{stats.urgentHigh}</p>
          <p className="mt-1 text-sm text-slate-400">Urgent / High</p>
        </div>
        <div className="rounded-xl border border-slate-800/60 bg-slate-900 p-4">
          <p className="text-2xl font-semibold text-white">{stats.agentsOnline}</p>
          <p className="mt-1 text-sm text-slate-400">Agents Online</p>
          <p className="text-xs text-slate-500">of {stats.agentsTotal} total</p>
        </div>
        <div className="rounded-xl border border-slate-800/60 bg-slate-900 p-4">
          <p className="text-2xl font-semibold text-white">{stats.tasksRunning}</p>
          <p className="mt-1 text-sm text-slate-400">Tasks Running</p>
          <p className="text-xs text-slate-500">{stats.tasksQueued} queued</p>
        </div>
      </div>

      {/* ── Main + Sidebar ── */}
      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        {/* ── Main column ── */}
        <div className="flex min-w-0 flex-1 flex-col gap-6 lg:w-[65%]">
          {/* My Issues */}
          <div className="rounded-xl border border-slate-800/60 bg-slate-900 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-white">My Issues</h2>
              <Link
                href="/tasks"
                className="text-xs text-slate-400 transition-colors hover:text-white"
              >
                View all &rarr;
              </Link>
            </div>

            {/* Filter pills */}
            <div className="mt-3 flex gap-1.5">
              {(
                [
                  ["ALL", "All"],
                  ["IN_PROGRESS", "In Progress"],
                  ["TODO", "Todo"],
                  ["IN_REVIEW", "In Review"],
                  ["BACKLOG", "Backlog"],
                ] as [IssueFilter, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setIssueFilter(value)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    issueFilter === value
                      ? "bg-indigo-500/20 text-indigo-400"
                      : "text-slate-400 hover:bg-slate-800 hover:text-slate-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Table */}
            <div className="mt-3 divide-y divide-slate-800/60">
              {filteredIssues.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  No issues assigned to you.{" "}
                  <Link href="/tasks" className="text-indigo-400 hover:underline">
                    View all tasks
                  </Link>
                </p>
              ) : (
                filteredIssues.slice(0, 10).map((issue) => (
                  <button
                    key={issue.id}
                    onClick={() =>
                      setSelectedIssue({
                        projectId: issue.project.id,
                        issueId: issue.id,
                      })
                    }
                    className="flex w-full items-center gap-3 px-1 py-2.5 text-left transition-colors hover:bg-slate-800/50"
                  >
                    <span className="shrink-0 text-xs font-mono text-slate-500 w-20 truncate">
                      {issue.identifier}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
                      {issue.title}
                    </span>
                    <PriorityBadge priority={issue.priority} />
                    <IssueStatusBadge status={issue.status} />
                    <span className="hidden shrink-0 text-xs text-slate-600 sm:block w-24 truncate text-right">
                      {issue.project.name}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Agent Tasks */}
          <div className="rounded-xl border border-slate-800/60 bg-slate-900 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-white">Agent Tasks</h2>
              <Link
                href="/toony-agents"
                className="text-xs text-slate-400 transition-colors hover:text-white"
              >
                View all &rarr;
              </Link>
            </div>

            {/* Filter pills */}
            <div className="mt-3 flex gap-1.5">
              {(
                [
                  ["ALL", "All"],
                  ["RUNNING", "Running"],
                  ["QUEUED", "Queued"],
                  ["COMPLETED", "Completed"],
                  ["FAILED", "Failed"],
                ] as [TaskFilter, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setTaskFilter(value)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    taskFilter === value
                      ? "bg-indigo-500/20 text-indigo-400"
                      : "text-slate-400 hover:bg-slate-800 hover:text-slate-300"
                  }`}
                >
                  {label}
                  {value !== "ALL" && taskCounts[value] ? (
                    <span className="ml-1 text-slate-500">
                      {taskCounts[value]}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            {/* Table */}
            <div className="mt-3 divide-y divide-slate-800/60">
              {filteredTasks.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  No agent tasks.
                </p>
              ) : (
                filteredTasks.slice(0, 8).map((task) => (
                  <Link
                    key={task.id}
                    href={`/toony-agents/${task.toony_agent_slug}/tasks/${task.id}`}
                    className="flex w-full items-center gap-3 px-1 py-2.5 text-left transition-colors hover:bg-slate-800/50"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${TASK_STATUS_COLORS[task.status] || "bg-slate-500"} ${
                        task.status === "RUNNING" ? "animate-pulse" : ""
                      }`}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
                      {task.title}
                    </span>
                    <span className="hidden shrink-0 text-xs text-slate-500 sm:block">
                      {task.agent_name}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        TASK_STATUS_COLORS[task.status]?.replace("bg-", "bg-").replace("400", "500/15") || "bg-slate-800"
                      } ${
                        TASK_STATUS_COLORS[task.status]?.replace("bg-", "text-") || "text-slate-400"
                      }`}
                    >
                      {TASK_STATUS_LABELS[task.status] || task.status}
                    </span>
                    <span className="shrink-0 text-xs text-slate-600 w-16 text-right">
                      {timeAgo(task.created_at)}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* My Projects */}
          <div className="rounded-xl border border-slate-800/60 bg-slate-900 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-white">My Projects</h2>
              <Link
                href="/projects"
                className="text-xs text-slate-400 transition-colors hover:text-white"
              >
                View all &rarr;
              </Link>
            </div>

            {sortedProjects.length === 0 ? (
              <p className="mt-4 py-6 text-center text-sm text-slate-500">
                You&apos;re not a member of any project yet.{" "}
                <Link href="/projects" className="text-indigo-400 hover:underline">
                  Browse projects
                </Link>
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {sortedProjects.slice(0, 6).map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="rounded-lg border border-slate-800/60 bg-slate-800/40 p-4 transition-colors hover:bg-slate-800/60"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-7 w-7 items-center justify-center rounded-md text-sm"
                        style={{ backgroundColor: project.color || "#334155" }}
                      >
                        {project.icon || project.name.charAt(0)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">
                        {project.name}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <StatusBadge status={project.status} />
                      {project.lead && (
                        <span className="truncate text-xs text-slate-500">
                          {project.lead.first_name} {project.lead.last_name}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Sidebar ── */}
        <div className="flex flex-col gap-6 lg:w-[35%]">
          {/* Toony Agents */}
          <div className="rounded-xl border border-slate-800/60 bg-slate-900 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-white">Toony Agents</h2>
              <Link
                href="/toony-agents"
                className="text-xs text-slate-400 transition-colors hover:text-white"
              >
                View &rarr;
              </Link>
            </div>

            {agents.length === 0 ? (
              <p className="mt-4 py-4 text-center text-sm text-slate-500">
                No agents registered.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-slate-800/40">
                {agents.map((agent) => {
                  const runningCount = agentTasks.filter(
                    (t) =>
                      t.toony_agent_slug === agent.slug &&
                      t.status === "RUNNING"
                  ).length;
                  return (
                    <Link
                      key={agent.id}
                      href={`/toony-agents/${agent.id}`}
                      className="flex items-center gap-3 py-3 transition-colors hover:bg-slate-800/30 -mx-2 px-2 rounded"
                    >
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${AGENT_STATUS_DOT[agent.status]} ${
                          agent.status === "ONLINE" ? "animate-pulse" : ""
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">
                          {agent.name}
                        </p>
                        <p className={`text-xs ${agent.status === "OFFLINE" ? "text-slate-600" : "text-slate-500"}`}>
                          {agent.status === "BUSY"
                            ? `Running: ${runningCount} task${runningCount !== 1 ? "s" : ""}`
                            : `Last seen: ${timeAgo(agent.last_heartbeat)}`}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-medium ${
                          agent.status === "ONLINE"
                            ? "text-emerald-400"
                            : agent.status === "BUSY"
                              ? "text-amber-400"
                              : "text-slate-500"
                        }`}
                      >
                        {agent.status === "ONLINE"
                          ? "Online"
                          : agent.status === "BUSY"
                            ? "Busy"
                            : "Offline"}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active Workflows */}
          <div className="rounded-xl border border-slate-800/60 bg-slate-900 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-white">Active Workflows</h2>
              <Link
                href="/workflows"
                className="text-xs text-slate-400 transition-colors hover:text-white"
              >
                View &rarr;
              </Link>
            </div>

            {activeWorkflows.length === 0 ? (
              <p className="mt-4 py-4 text-center text-sm text-slate-500">
                No active workflows.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-slate-800/40">
                {activeWorkflows.map((wf) => (
                  <Link
                    key={wf.id}
                    href={`/workflows/${wf.id}/edit`}
                    className="block py-3 transition-colors hover:bg-slate-800/30 -mx-2 px-2 rounded"
                  >
                    <p className="truncate text-sm font-medium text-white">
                      {wf.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {wf.project
                        ? wf.project.name
                        : wf.organization
                          ? wf.organization.name
                          : "Global"}{" "}
                      &middot; {wf.nodes_count} node
                      {wf.nodes_count !== 1 ? "s" : ""}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Recent Artifacts */}
          <div className="rounded-xl border border-slate-800/60 bg-slate-900 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-white">Recent Artifacts</h2>
              <Link
                href="/artifacts"
                className="text-xs text-slate-400 transition-colors hover:text-white"
              >
                View &rarr;
              </Link>
            </div>

            {recentArtifacts.length === 0 ? (
              <p className="mt-4 py-4 text-center text-sm text-slate-500">
                No artifacts yet.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-slate-800/40">
                {recentArtifacts.map((artifact) => (
                  <div
                    key={artifact.id}
                    className="py-3 -mx-2 px-2"
                  >
                    <p className="truncate text-sm font-medium text-white">
                      {artifact.title}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <ArtifactTypeBadge type={artifact.artifact_type} />
                      <ArtifactStatusBadge status={artifact.status} />
                      <span className="ml-auto text-xs text-slate-600">
                        {timeAgo(artifact.created_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Issue Side Panel ── */}
      {selectedIssue && (
        <IssueSidePanel
          projectId={selectedIssue.projectId}
          issueId={selectedIssue.issueId}
          onClose={() => setSelectedIssue(null)}
        />
      )}
    </div>
  );
}
```

**Step 2: Verify the build**

Run: `cd frontend && ./node_modules/.bin/next build`
Expected: Build succeeds with no errors.

**Step 3: Commit**

```bash
git add frontend/app/\(dashboard\)/page.tsx
git commit -m "feat(frontend): build personal dashboard with stats, issues, tasks, projects, agents, workflows, and artifacts"
```

---

### Task 4: Polish the agent task status badge styling

The inline badge styling for agent tasks in Task 3 uses string replacement which is fragile. Replace it with a proper badge map.

**Files:**
- Modify: `frontend/app/(dashboard)/page.tsx`

**Step 1: Replace the TASK_STATUS_COLORS approach**

Replace the `TASK_STATUS_COLORS` and `TASK_STATUS_LABELS` constants with a combined map that includes badge styling:

```typescript
const TASK_STATUS_BADGE: Record<string, { dot: string; badge: string; label: string }> = {
  RUNNING: { dot: "bg-amber-400", badge: "bg-amber-500/15 text-amber-400", label: "Running" },
  QUEUED: { dot: "bg-slate-400", badge: "bg-slate-500/15 text-slate-400", label: "Queued" },
  ASSIGNED: { dot: "bg-blue-400", badge: "bg-blue-500/15 text-blue-400", label: "Assigned" },
  WAITING_FOR_ANSWER: { dot: "bg-purple-400", badge: "bg-purple-500/15 text-purple-400", label: "Waiting" },
  COMPLETED: { dot: "bg-emerald-400", badge: "bg-emerald-500/15 text-emerald-400", label: "Completed" },
  FAILED: { dot: "bg-red-400", badge: "bg-red-500/15 text-red-400", label: "Failed" },
  CANCELLED: { dot: "bg-slate-500", badge: "bg-slate-500/15 text-slate-500", label: "Cancelled" },
  PAUSED: { dot: "bg-orange-400", badge: "bg-orange-500/15 text-orange-400", label: "Paused" },
};
```

Update the task row JSX to use `TASK_STATUS_BADGE[task.status]?.dot`, `.badge`, `.label`.

**Step 2: Verify the build**

Run: `cd frontend && ./node_modules/.bin/next build`

**Step 3: Commit**

```bash
git add frontend/app/\(dashboard\)/page.tsx
git commit -m "style(frontend): use proper badge map for agent task status colors"
```

---

### Task 5: Verify the full page visually and fix any lint issues

**Step 1: Run frontend lint**

Run: `cd frontend && ./node_modules/.bin/next lint`
Expected: No errors.

**Step 2: Fix any lint issues found**

Common issues to watch for:
- Unused imports
- Missing `key` props
- Unescaped entities (use `&apos;` for apostrophes)

**Step 3: Commit any fixes**

```bash
git add -u
git commit -m "fix(frontend): address lint issues in dashboard page"
```
