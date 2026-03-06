"use client";

import { useState, useCallback, useEffect } from "react";
import type { CrossProjectIssueList, ProjectList, IssueStatus, IssuePriority } from "@/types";
import { listAllIssues, updateIssue } from "@/lib/api/issues";
import { listProjects } from "@/lib/api/projects";
import { TasksKanbanBoard } from "@/components/tasks/tasks-kanban-board";
import { IssueSidePanel } from "@/components/tasks/issue-side-panel";

interface Filters {
  project_id?: string;
  priority?: IssuePriority;
  assignee_id?: string;
}

export default function TasksPage() {
  const [issues, setIssues] = useState<CrossProjectIssueList[]>([]);
  const [projects, setProjects] = useState<ProjectList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({});
  const [selectedIssue, setSelectedIssue] = useState<{ projectId: string; issueId: string } | null>(null);

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

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Tasks</h1>
      </div>

      {/* Filters */}
      <div className="mt-4 flex items-center gap-3">
        {/* Project filter */}
        <select
          value={filters.project_id || ""}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              project_id: e.target.value || undefined,
            }))
          }
          className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 focus:border-indigo-500 focus:outline-none"
        >
          <option value="">All Projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {/* Priority filter */}
        <select
          value={filters.priority || ""}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              priority: (e.target.value as IssuePriority) || undefined,
            }))
          }
          className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 focus:border-indigo-500 focus:outline-none"
        >
          <option value="">All Priorities</option>
          <option value="URGENT">Urgent</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
          <option value="NONE">None</option>
        </select>
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
        />
      )}
    </div>
  );
}
