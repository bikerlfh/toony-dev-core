"use client";

import { useState, useCallback, useEffect } from "react";
import type { CrossProjectIssueList, ProjectList, IssueStatus, IssuePriority, ProjectWsEvent } from "@/types";
import { listAllIssues, updateIssue } from "@/lib/api/issues";
import { listProjects } from "@/lib/api/projects";
import { useUserIssuesWebSocket } from "@/hooks/use-user-issues-websocket";
import { TasksKanbanBoard } from "@/components/tasks/tasks-kanban-board";
import { IssueSidePanel } from "@/components/tasks/issue-side-panel";
import { QuickCreateIssueModal } from "@/components/tasks/quick-create-issue-modal";
import { Select } from "@/components/ui/select";

interface Filters {
  project_id?: string;
  priority?: IssuePriority;
  assignee_id?: string;
  updated_after?: string;
}

const TIME_RANGE_OPTIONS = [
  { value: "", label: "All Time" },
  { value: "1", label: "Últimas 24h" },
  { value: "3", label: "Últimos 3 días" },
  { value: "7", label: "Última semana" },
  { value: "14", label: "Últimas 2 semanas" },
  { value: "30", label: "Último mes" },
  { value: "90", label: "Últimos 3 meses" },
];

export default function TasksPage() {
  const [issues, setIssues] = useState<CrossProjectIssueList[]>([]);
  const [projects, setProjects] = useState<ProjectList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({});
  const [selectedIssue, setSelectedIssue] = useState<{ projectId: string; issueId: string } | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchIssues = useCallback(async () => {
    try {
      const data = await listAllIssues(filters);
      setIssues(data.results);
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  const fetchProjects = useCallback(async () => {
    const data = await listProjects();
    setProjects(data.results);
  }, []);

  useEffect(() => { fetchIssues(); }, [fetchIssues]);
  useEffect(() => { fetchProjects(); }, [fetchProjects]);
  useEffect(() => { window.dispatchEvent(new Event("sidebar-collapse")); }, []);

  const handleStatusChange = useCallback(
    async (issue: CrossProjectIssueList, newStatus: IssueStatus) => {
      // Optimistic update
      setIssues((prev) =>
        prev.map((i) => (i.id === issue.id ? { ...i, status: newStatus } : i))
      );
      try {
        await updateIssue(issue.project_id, issue.id, { status: newStatus });
      } catch {
        // Revert on failure
        fetchIssues();
      }
    },
    [fetchIssues]
  );

  const handleWsEvent = useCallback(
    (event: ProjectWsEvent) => {
      if (event.type === "issue.updated") {
        setIssues((prev) =>
          prev.map((i) =>
            i.id === event.data.id ? { ...i, ...event.data } : i
          )
        );
      } else if (event.type === "issue.deleted") {
        setIssues((prev) => prev.filter((i) => i.id !== event.data.id));
      } else if (event.type === "issue.created") {
        fetchIssues();
      }
    },
    [fetchIssues]
  );

  useUserIssuesWebSocket({ onEvent: handleWsEvent });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Tasks</h1>
      </div>

      {/* Filters */}
      <div className="mt-4 flex items-center gap-3">
        {/* Project filter */}
        <Select
          options={[
            { value: "", label: "All Projects" },
            ...projects.map((p) => ({ value: p.id, label: p.name })),
          ]}
          value={filters.project_id || ""}
          onChange={(v) =>
            setFilters((f) => ({
              ...f,
              project_id: v || undefined,
            }))
          }
          placeholder="All Projects"
        />

        {/* Priority filter */}
        <Select
          options={[
            { value: "", label: "All Priorities" },
            { value: "URGENT", label: "Urgent" },
            { value: "HIGH", label: "High" },
            { value: "MEDIUM", label: "Medium" },
            { value: "LOW", label: "Low" },
            { value: "NONE", label: "None" },
          ]}
          value={filters.priority || ""}
          onChange={(v) =>
            setFilters((f) => ({
              ...f,
              priority: (v as IssuePriority) || undefined,
            }))
          }
          placeholder="All Priorities"
        />

        {/* Time range filter */}
        <Select
          options={TIME_RANGE_OPTIONS}
          value={
            TIME_RANGE_OPTIONS.find((o) => {
              if (!filters.updated_after) return o.value === "";
              const days = Math.round(
                (Date.now() - new Date(filters.updated_after).getTime()) / 86400000
              );
              return o.value === String(days);
            })?.value || ""
          }
          onChange={(v) =>
            setFilters((f) => ({
              ...f,
              updated_after: v
                ? new Date(Date.now() - Number(v) * 86400000).toISOString()
                : undefined,
            }))
          }
          placeholder="All Time"
        />

        <button
          onClick={() => setShowCreateModal(true)}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Create issue
        </button>
      </div>

      {/* Board */}
      <div className="mt-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-500" />
          </div>
        ) : (
          <TasksKanbanBoard
            issues={issues}
            onIssueClick={(issue) =>
              setSelectedIssue({ projectId: issue.project_id, issueId: issue.id })
            }
            onStatusChange={handleStatusChange}
          />
        )}
      </div>

      {/* Side panel */}
      {selectedIssue && (
        <IssueSidePanel
          projectId={selectedIssue.projectId}
          issueId={selectedIssue.issueId}
          onClose={() => setSelectedIssue(null)}
          onUpdated={fetchIssues}
        />
      )}

      {/* Quick create modal */}
      {showCreateModal && (
        <QuickCreateIssueModal
          projects={projects}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            fetchIssues();
          }}
        />
      )}
    </div>
  );
}
