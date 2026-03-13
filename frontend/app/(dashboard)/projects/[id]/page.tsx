"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getProject,
  updateProject,
  deleteProject,
  listProjectMembers,
  addProjectMember,
  updateProjectMemberRole,
  removeProjectMember,
  getProjectSettings,
  updateProjectSettings,
} from "@/lib/api/projects";
import {
  listMilestones,
  createMilestone,
  updateMilestone,
  deleteMilestone,
} from "@/lib/api/milestones";
import {
  listCycles,
  createCycle,
  updateCycle,
  deleteCycle,
} from "@/lib/api/cycles";
import { listLabels, listTeams } from "@/lib/api/workspace";
import { listIssues, updateIssue } from "@/lib/api/issues";
import { listResources, createResource, updateResource, deleteResource } from "@/lib/api/resources";
import { listProjectTeams, addProjectTeam, removeProjectTeam } from "@/lib/api/project-teams";
// Role checks removed — will be re-implemented when org context is rebuilt
import { ConfirmModal } from "@/components/confirm-modal";
import { StatusBadge } from "@/components/status-badge";
import { PriorityBadge } from "@/components/priority-badge";
import { FilterBar } from "@/components/issues/filter-bar";
import { KanbanBoard } from "@/components/issues/kanban-board";
import { CreateIssueModal } from "@/components/issues/create-issue-modal";
import { Select } from "@/components/ui/select";
import type {
  ProjectDetail,
  ProjectMember,
  ProjectMemberRole,
  ProjectSettings,
  ProjectStatus,
  ProjectPriority,
  Milestone,
  MilestoneStatus,
  Cycle,
  CycleStatus,
  EstimationMethod,
  IssueList,
  IssueStatus,
  IssueFilters,
  Label,
  ProjectWsEvent,
  ProjectResource,
  ResourceType,
  ProjectTeam,
  Team,
} from "@/types";
import { useProjectWebSocket } from "@/hooks/use-project-websocket";

type Tab = "overview" | "issues" | "milestones" | "cycles" | "members" | "teams" | "resources" | "settings";

const TABS: { key: Tab; label: string }[] = [
  { key: "issues", label: "Issues" },
  { key: "overview", label: "Overview" },
  { key: "resources", label: "Resources" },
  { key: "milestones", label: "Milestones" },
  { key: "cycles", label: "Cycles" },
  { key: "members", label: "Members" },
  { key: "teams", label: "Teams" },
  { key: "settings", label: "Settings" },
];

const PROJECT_STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "BACKLOG", label: "Backlog" },
  { value: "PLANNED", label: "Planned" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "PAUSED", label: "Paused" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELED", label: "Canceled" },
];

const PROJECT_PRIORITY_OPTIONS: { value: ProjectPriority; label: string }[] = [
  { value: "NONE", label: "None" },
  { value: "URGENT", label: "Urgent" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

const PROJECT_MEMBER_ROLES: { value: ProjectMemberRole; label: string }[] = [
  { value: "LEAD", label: "Lead" },
  { value: "CONTRIBUTOR", label: "Contributor" },
  { value: "REVIEWER", label: "Reviewer" },
];

const MEMBER_ROLE_COLORS: Record<ProjectMemberRole, string> = {
  LEAD: "bg-purple-500/15 text-purple-400",
  CONTRIBUTOR: "bg-blue-500/15 text-blue-400",
  REVIEWER: "bg-emerald-500/15 text-emerald-400",
};

const MILESTONE_STATUS_OPTIONS: { value: MilestoneStatus; label: string }[] = [
  { value: "PLANNED", label: "Planned" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "COMPLETED", label: "Completed" },
];

const CYCLE_STATUS_OPTIONS: { value: CycleStatus; label: string }[] = [
  { value: "PLANNED", label: "Planned" },
  { value: "ACTIVE", label: "Active" },
  { value: "COMPLETED", label: "Completed" },
];

const ESTIMATION_OPTIONS: { value: EstimationMethod; label: string }[] = [
  { value: "STORY_POINTS", label: "Story Points" },
  { value: "T_SHIRT", label: "T-Shirt Sizes" },
  { value: "HOURS", label: "Hours" },
];

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [activeTab, setActiveTab] = useState<Tab>("issues");
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const canManage = true;
  const canEditIssues = true;

  // Inline editing — title
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [isSavingTitle, setIsSavingTitle] = useState(false);

  // Inline editing — short summary
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [isSavingSummary, setIsSavingSummary] = useState(false);

  const fetchProject = useCallback(async () => {
    try {
      const data = await getProject(projectId);
      setProject(data);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  function startEditTitle() {
    if (!project) return;
    setTitleDraft(project.name);
    setEditingTitle(true);
  }

  async function saveTitle() {
    if (!project || isSavingTitle) return;
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === project.name) {
      setEditingTitle(false);
      return;
    }
    setIsSavingTitle(true);
    try {
      await updateProject(projectId, { name: trimmed });
      await fetchProject();
      setEditingTitle(false);
    } catch {
      setTitleDraft(project.name);
      setEditingTitle(false);
    } finally {
      setIsSavingTitle(false);
    }
  }

  function startEditSummary() {
    if (!project) return;
    setSummaryDraft(project.short_summary || "");
    setEditingSummary(true);
  }

  async function saveSummary() {
    if (!project || isSavingSummary) return;
    const trimmed = summaryDraft.trim();
    if (trimmed === (project.short_summary || "")) {
      setEditingSummary(false);
      return;
    }
    setIsSavingSummary(true);
    try {
      await updateProject(projectId, { short_summary: trimmed });
      await fetchProject();
      setEditingSummary(false);
    } catch {
      setSummaryDraft(project.short_summary || "");
      setEditingSummary(false);
    } finally {
      setIsSavingSummary(false);
    }
  }

  if (isLoading) return <p className="text-slate-500">Loading project...</p>;
  if (!project) return <p className="text-red-400">Project not found.</p>;

  return (
    <div>
      {/* Back link */}
      <button
        onClick={() => router.push(`/projects`)}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-300"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 12L6 8l4-4" />
        </svg>
        Projects
      </button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          {/* Title — click to edit */}
          {editingTitle ? (
            <div>
              <input
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveTitle();
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                disabled={isSavingTitle}
                autoFocus
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-2xl font-medium tracking-tight text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
              />
              <div className="mt-2 flex items-center gap-2">
                <button onClick={saveTitle} disabled={isSavingTitle}
                  className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50">
                  {isSavingTitle ? "Saving..." : "Save"}
                </button>
                <button onClick={() => setEditingTitle(false)} disabled={isSavingTitle}
                  className="rounded-lg border border-slate-700 px-3 py-1 text-xs font-medium text-slate-300 transition-colors hover:text-white">
                  Cancel
                </button>
                <span className="text-[10px] text-slate-600">Enter to save · Esc to cancel</span>
              </div>
            </div>
          ) : (
            <h1
              onClick={canManage ? startEditTitle : undefined}
              className={`text-2xl font-medium tracking-tight text-white ${
                canManage ? "cursor-text rounded-lg px-3 py-2 -mx-3 -my-2 transition-colors hover:bg-slate-800/40" : ""
              }`}
              title={canManage ? "Click to edit title" : undefined}
            >
              {project.name}
            </h1>
          )}

          <div className="mt-2 flex items-center gap-2">
            <StatusBadge status={project.status} />
            <PriorityBadge priority={project.priority} />
            {project.lead && (
              <>
                <span className="text-slate-700">&middot;</span>
                <span className="text-sm text-slate-500">
                  {project.lead.first_name} {project.lead.last_name}
                </span>
              </>
            )}
          </div>

          {/* Short summary — click to edit */}
          {editingSummary ? (
            <div className="mt-2">
              <input
                type="text"
                value={summaryDraft}
                onChange={(e) => setSummaryDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveSummary();
                  if (e.key === "Escape") setEditingSummary(false);
                }}
                disabled={isSavingSummary}
                autoFocus
                maxLength={255}
                placeholder="A brief tagline for the project"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-300 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
              />
              <div className="mt-1.5 flex items-center gap-2">
                <button onClick={saveSummary} disabled={isSavingSummary}
                  className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50">
                  {isSavingSummary ? "Saving..." : "Save"}
                </button>
                <button onClick={() => setEditingSummary(false)} disabled={isSavingSummary}
                  className="rounded-lg border border-slate-700 px-3 py-1 text-xs font-medium text-slate-300 transition-colors hover:text-white">
                  Cancel
                </button>
                <span className="text-[10px] text-slate-600">Enter to save · Esc to cancel</span>
              </div>
            </div>
          ) : (
            <p
              onClick={canManage ? startEditSummary : undefined}
              className={`mt-2 text-sm ${
                project.short_summary ? "text-slate-400" : "text-slate-600 italic"
              } ${canManage ? "cursor-text rounded-lg px-3 py-1.5 -mx-3 transition-colors hover:bg-slate-800/40" : ""}`}
              title={canManage ? "Click to edit summary" : undefined}
            >
              {project.short_summary || "Add a short summary..."}
            </p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 border-b border-slate-800/60">
        <nav className="-mb-px flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-slate-500 hover:border-slate-700 hover:text-slate-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="mt-6">
        {activeTab === "overview" && (
          <OverviewTab
            project={project}
            projectId={projectId}
            canManage={canManage}
            onUpdated={fetchProject}
          />
        )}
        {activeTab === "issues" && (
          <IssuesTab projectId={projectId} canManage={canEditIssues} />
        )}
        {activeTab === "milestones" && (
          <MilestonesTab projectId={projectId} canManage={canManage} />
        )}
        {activeTab === "cycles" && (
          <CyclesTab projectId={projectId} canManage={canManage} />
        )}
        {activeTab === "members" && (
          <MembersTab projectId={projectId} canManage={canManage} />
        )}
        {activeTab === "teams" && (
          <TeamsTab projectId={projectId} canManage={canManage} />
        )}
        {activeTab === "resources" && (
          <ResourcesTab projectId={projectId} canManage={canManage} />
        )}
        {activeTab === "settings" && (
          <SettingsTab projectId={projectId} canManage={canManage} onDeleted={() => router.push(`/projects`)} />
        )}
      </div>
    </div>
  );
}

// --- Overview Tab ---

function OverviewTab({
  project,
  projectId,
  canManage,
  onUpdated,
}: {
  project: ProjectDetail;
  projectId: string;
  canManage: boolean;
  onUpdated: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [description, setDescription] = useState(project.description);
  const [status, setStatus] = useState(project.status);
  const [priority, setPriority] = useState(project.priority);
  const [startDate, setStartDate] = useState(project.start_date || "");
  const [targetDate, setTargetDate] = useState(project.target_date || "");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateProject(projectId, {
        description,
        status,
        priority,
        start_date: startDate || null,
        target_date: targetDate || null,
      });
      setIsEditing(false);
      onUpdated();
    } finally {
      setIsSaving(false);
    }
  }

  function resetAndEdit() {
    setDescription(project.description);
    setStatus(project.status);
    setPriority(project.priority);
    setStartDate(project.start_date || "");
    setTargetDate(project.target_date || "");
    setIsEditing(true);
  }

  const INPUT_CLASS =
    "mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors";

  if (isEditing) {
    return (
      <form onSubmit={handleSave} className="flex gap-6">
        {/* Left — description */}
        <div className="min-w-0 flex-1">
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={12}
            placeholder="Describe the project goals, scope, and context..."
            className={`${INPUT_CLASS} resize-y`}
          />
          <div className="mt-4 flex gap-3">
            <button type="submit" disabled={isSaving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50">
              {isSaving ? "Saving..." : "Save"}
            </button>
            <button type="button" onClick={() => setIsEditing(false)}
              className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white">
              Cancel
            </button>
          </div>
        </div>

        {/* Right — properties */}
        <div className="w-64 shrink-0 space-y-4">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">Status</label>
            <Select options={PROJECT_STATUS_OPTIONS} value={status} onChange={(v) => setStatus(v as ProjectStatus)} className="mt-1.5" />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">Priority</label>
            <Select options={PROJECT_PRIORITY_OPTIONS} value={priority} onChange={(v) => setPriority(v as ProjectPriority)} className="mt-1.5" />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">Start date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={INPUT_CLASS} />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">Target date</label>
            <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className={INPUT_CLASS} />
          </div>
        </div>
      </form>
    );
  }

  return (
    <div className="flex gap-6">
      {/* Left — description */}
      <div className="min-w-0 flex-1">
        {project.description ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-400">{project.description}</p>
        ) : (
          <p className="text-sm italic text-slate-600">No description yet.</p>
        )}

        {canManage && (
          <button onClick={resetAndEdit}
            className="mt-6 rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white">
            Edit project
          </button>
        )}
      </div>

      {/* Right — metadata sidebar */}
      <div className="w-64 shrink-0">
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/50">
          <div className="border-b border-slate-800/40 px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-600">Lead</p>
            <p className="mt-1 text-sm font-medium text-slate-200">
              {project.lead ? `${project.lead.first_name} ${project.lead.last_name}` : "\u2014"}
            </p>
          </div>
          <div className="border-b border-slate-800/40 px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-600">Issues</p>
            <p className="mt-1 text-sm font-medium text-slate-200">{project.issue_count}</p>
          </div>
          <div className="border-b border-slate-800/40 px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-600">Start date</p>
            <p className="mt-1 text-sm font-medium text-slate-200">
              {project.start_date
                ? new Date(project.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                : "\u2014"}
            </p>
          </div>
          <div className="border-b border-slate-800/40 px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-600">Target date</p>
            <p className="mt-1 text-sm font-medium text-slate-200">
              {project.target_date
                ? new Date(project.target_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                : "\u2014"}
            </p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-600">Members</p>
            <p className="mt-1 text-sm font-medium text-slate-200">{project.member_count}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Resources Tab ---

function ResourcesTab({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const [resources, setResources] = useState<ProjectResource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [resourceModalTarget, setResourceModalTarget] = useState<ProjectResource | null | undefined>(undefined);
  const [isDeletingResource, setIsDeletingResource] = useState<string | null>(null);

  const fetchResources = useCallback(async () => {
    try {
      setResources((await listResources(projectId)).results);
    } catch { /* ignore */ }
    finally { setIsLoading(false); }
  }, [projectId]);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  if (isLoading) return <p className="text-slate-500">Loading resources...</p>;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium text-white">Resources</h2>
        {canManage && (
          <button onClick={() => setResourceModalTarget(null)}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500">
            + Add resource
          </button>
        )}
      </div>

      {resources.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No resources yet.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {resources.map((res) => (
            <div key={res.id} className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-900/50 px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                  res.type === "DOCUMENTATION" ? "bg-blue-500/15 text-blue-400" : "bg-emerald-500/15 text-emerald-400"
                }`}>
                  {res.type === "DOCUMENTATION" ? "Docs" : "Web"}
                </span>
                <a href={res.url} target="_blank" rel="noopener noreferrer"
                  className="truncate text-sm font-medium text-slate-200 transition-colors hover:text-indigo-400">
                  {res.title}
                </a>
              </div>
              {canManage && (
                <div className="ml-3 flex shrink-0 items-center gap-2">
                  <button onClick={() => setResourceModalTarget(res)}
                    className="text-slate-600 transition-colors hover:text-indigo-400">
                    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11.33 2a1.89 1.89 0 012.67 2.67L5.33 13.33 2 14l.67-3.33L11.33 2z" /></svg>
                  </button>
                  <button
                    disabled={isDeletingResource === res.id}
                    onClick={async () => {
                      setIsDeletingResource(res.id);
                      try {
                        await deleteResource(projectId, res.id);
                        fetchResources();
                      } finally { setIsDeletingResource(null); }
                    }}
                    className="text-slate-600 transition-colors hover:text-red-400">
                    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 011.34-1.34h2.66a1.33 1.33 0 011.34 1.34V4m2 0v9.33a1.33 1.33 0 01-1.34 1.34H4.67a1.33 1.33 0 01-1.34-1.34V4h9.34z" /></svg>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {resourceModalTarget !== undefined && (
        <ResourceModal
          projectId={projectId}
          resource={resourceModalTarget}
          onClose={() => setResourceModalTarget(undefined)}
          onSaved={fetchResources}
        />
      )}
    </div>
  );
}

// --- Resource Modal ---

const RESOURCE_INPUT_CLASS =
  "mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors";

function ResourceModal({
  projectId,
  resource,
  onClose,
  onSaved,
}: {
  projectId: string;
  resource: ProjectResource | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = resource !== null;
  const [title, setTitle] = useState(resource?.title ?? "");
  const [url, setUrl] = useState(resource?.url ?? "");
  const [type, setType] = useState<ResourceType>(resource?.type ?? "DOCUMENTATION");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSaving(true);
    try {
      if (isEdit) {
        await updateResource(projectId, resource.id, { title, url, type });
      } else {
        await createResource(projectId, { title, url, type });
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? Object.values((err as { response: { data: Record<string, string[]> } }).response.data).flat().join(" ")
          : "Something went wrong";
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-xl border border-slate-800/60 bg-slate-900 p-6">
        <h2 className="mb-4 text-base font-medium tracking-tight text-white">
          {isEdit ? "Edit resource" : "Add resource"}
        </h2>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
            <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="8" r="6.25" />
              <path d="M8 5v3.5M8 10.5h.007" strokeLinecap="round" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400">Title</label>
            <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} className={RESOURCE_INPUT_CLASS} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400">URL</label>
            <input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" className={RESOURCE_INPUT_CLASS} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400">Type</label>
            <Select
              options={[
                { value: "DOCUMENTATION", label: "Documentation" },
                { value: "WEBPAGE", label: "Webpage" },
              ]}
              value={type}
              onChange={(v) => setType(v as ResourceType)}
              className="mt-1.5"
            />
          </div>
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-600">esc to cancel</span>
            <div className="flex gap-3">
              <button type="button" onClick={onClose}
                className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white">
                Cancel
              </button>
              <button type="submit" disabled={isSaving || !title || !url}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50">
                {isSaving ? "Saving..." : isEdit ? "Save resource" : "Add"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Milestones Tab ---

function MilestonesTab({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newTargetDate, setNewTargetDate] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Milestone | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchMilestones = useCallback(async () => {
    try {
      setMilestones((await listMilestones(projectId)).results);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchMilestones(); }, [fetchMilestones]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setIsCreating(true);
    try {
      await createMilestone(projectId, {
        name: newName, description: newDescription, target_date: newTargetDate || null,
      });
      setShowCreate(false);
      setNewName(""); setNewDescription(""); setNewTargetDate("");
      fetchMilestones();
    } finally { setIsCreating(false); }
  }

  async function handleStatusChange(m: Milestone, status: MilestoneStatus) {
    await updateMilestone(projectId, m.id, { status });
    fetchMilestones();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteMilestone(projectId, deleteTarget.id);
      setDeleteTarget(null);
      fetchMilestones();
    } finally { setIsDeleting(false); }
  }

  if (isLoading) return <p className="text-slate-500">Loading milestones...</p>;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium text-white">Milestones</h2>
        {canManage && (
          <button onClick={() => setShowCreate(true)}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500">Add milestone</button>
        )}
      </div>

      {milestones.length === 0 ? (
        <p className="mt-4 text-slate-500">No milestones yet.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {milestones.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-900 p-4">
              <div>
                <p className="font-medium text-slate-200">{m.name}</p>
                <div className="mt-1 flex items-center gap-2">
                  {canManage ? (
                    <Select options={MILESTONE_STATUS_OPTIONS} value={m.status} onChange={(v) => handleStatusChange(m, v as MilestoneStatus)} size="sm" />
                  ) : (
                    <StatusBadge status={m.status} type="milestone" />
                  )}
                  {m.target_date && <span className="text-xs text-slate-500">Target: {new Date(m.target_date).toLocaleDateString()}</span>}
                </div>
              </div>
              {canManage && (
                <button onClick={() => setDeleteTarget(m)} className="text-sm text-red-400 transition-colors hover:text-red-300">Delete</button>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-xl border border-slate-800/60 bg-slate-900 p-6">
            <h2 className="mb-4 text-base font-medium tracking-tight text-white">Add milestone</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400">Name</label>
                <input type="text" required value={newName} onChange={(e) => setNewName(e.target.value)}
                  className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400">Description</label>
                <textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} rows={2}
                  className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400">Target date</label>
                <input type="date" value={newTargetDate} onChange={(e) => setNewTargetDate(e.target.value)}
                  className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white">Cancel</button>
                <button type="submit" disabled={isCreating}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50">
                  {isCreating ? "Adding..." : "Add milestone"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal title="Delete milestone" message={`Delete "${deleteTarget.name}"?`}
          confirmLabel="Delete" confirmVariant="danger" isLoading={isDeleting}
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}

// --- Cycles Tab ---

function CyclesTab({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Cycle | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchCycles = useCallback(async () => {
    try {
      setCycles((await listCycles(projectId)).results);
    } finally { setIsLoading(false); }
  }, [projectId]);

  useEffect(() => { fetchCycles(); }, [fetchCycles]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setIsCreating(true);
    try {
      await createCycle(projectId, { name: newName, start_date: newStart, end_date: newEnd });
      setShowCreate(false);
      setNewName(""); setNewStart(""); setNewEnd("");
      fetchCycles();
    } finally { setIsCreating(false); }
  }

  async function handleStatusChange(c: Cycle, status: CycleStatus) {
    await updateCycle(projectId, c.id, { status });
    fetchCycles();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteCycle(projectId, deleteTarget.id);
      setDeleteTarget(null);
      fetchCycles();
    } finally { setIsDeleting(false); }
  }

  if (isLoading) return <p className="text-slate-500">Loading cycles...</p>;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium text-white">Cycles</h2>
        {canManage && (
          <button onClick={() => setShowCreate(true)}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500">Add cycle</button>
        )}
      </div>

      {cycles.length === 0 ? (
        <p className="mt-4 text-slate-500">No cycles yet.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {cycles.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-900 p-4">
              <div>
                <p className="font-medium text-slate-200">
                  <span className="mr-2 text-slate-500">#{c.number}</span>{c.name}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  {canManage ? (
                    <Select options={CYCLE_STATUS_OPTIONS} value={c.status} onChange={(v) => handleStatusChange(c, v as CycleStatus)} size="sm" />
                  ) : (
                    <StatusBadge status={c.status} type="cycle" />
                  )}
                  <span className="text-xs text-slate-500">
                    {new Date(c.start_date).toLocaleDateString()} — {new Date(c.end_date).toLocaleDateString()}
                  </span>
                </div>
              </div>
              {canManage && (
                <button onClick={() => setDeleteTarget(c)} className="text-sm text-red-400 transition-colors hover:text-red-300">Delete</button>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-xl border border-slate-800/60 bg-slate-900 p-6">
            <h2 className="mb-4 text-base font-medium tracking-tight text-white">Add cycle</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400">Name</label>
                <input type="text" required value={newName} onChange={(e) => setNewName(e.target.value)}
                  className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400">Start date</label>
                  <input type="date" required value={newStart} onChange={(e) => setNewStart(e.target.value)}
                    className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400">End date</label>
                  <input type="date" required value={newEnd} onChange={(e) => setNewEnd(e.target.value)}
                    className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white">Cancel</button>
                <button type="submit" disabled={isCreating}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50">
                  {isCreating ? "Adding..." : "Add cycle"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal title="Delete cycle" message={`Delete "${deleteTarget.name}"?`}
          confirmLabel="Delete" confirmVariant="danger" isLoading={isDeleting}
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}

// --- Members Tab ---

function MembersTab({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<ProjectMemberRole>("CONTRIBUTOR");
  const [addError, setAddError] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ProjectMember | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const fetchMembers = useCallback(async () => {
    try {
      setMembers((await listProjectMembers(projectId)).results);
    } finally { setIsLoading(false); }
  }, [projectId]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAddError("");
    setIsAdding(true);
    try {
      await addProjectMember(projectId, { email: newEmail, role: newRole });
      setShowAdd(false); setNewEmail(""); setNewRole("CONTRIBUTOR");
      fetchMembers();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })?.response?.data;
      setAddError(data ? Object.values(data).flat().join(" ") : "Failed to add member.");
    } finally { setIsAdding(false); }
  }

  async function handleRoleChange(member: ProjectMember, role: ProjectMemberRole) {
    await updateProjectMemberRole(projectId, member.user.id, { role });
    fetchMembers();
  }

  async function handleRemove() {
    if (!removeTarget) return;
    setIsRemoving(true);
    try {
      await removeProjectMember(projectId, removeTarget.user.id);
      setRemoveTarget(null);
      fetchMembers();
    } finally { setIsRemoving(false); }
  }

  if (isLoading) return <p className="text-slate-500">Loading members...</p>;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium text-white">Members</h2>
        {canManage && (
          <button onClick={() => setShowAdd(true)}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500">Add member</button>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-800/60 bg-slate-900">
        <table className="min-w-full divide-y divide-slate-800/60">
          <thead className="bg-slate-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Member</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Joined</th>
              {canManage && <th className="px-6 py-3 text-right text-xs font-medium uppercase text-slate-500">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {members.map((m) => (
              <tr key={m.id} className="hover:bg-slate-900/60">
                <td className="px-6 py-4">
                  <div className="flex items-center">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-sm font-medium text-slate-400">
                      {m.user.first_name?.[0]}{m.user.last_name?.[0]}
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-slate-200">{m.user.first_name} {m.user.last_name}</p>
                      <p className="text-sm text-slate-500">{m.user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  {canManage ? (
                    <Select options={PROJECT_MEMBER_ROLES} value={m.role} onChange={(v) => handleRoleChange(m, v as ProjectMemberRole)} size="sm" />
                  ) : (
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${MEMBER_ROLE_COLORS[m.role]}`}>{m.role}</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-slate-500">{new Date(m.joined_at).toLocaleDateString()}</td>
                {canManage && (
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => setRemoveTarget(m)} className="text-sm text-red-400 transition-colors hover:text-red-300">Remove</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-xl border border-slate-800/60 bg-slate-900 p-6">
            <h2 className="mb-4 text-base font-medium tracking-tight text-white">Add project member</h2>
            {addError && <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400"><svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6.25" /><path d="M8 5v3.5M8 10.5h.007" strokeLinecap="round" /></svg><span>{addError}</span></div>}
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400">Email</label>
                <input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                  className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400">Role</label>
                <Select options={PROJECT_MEMBER_ROLES} value={newRole} onChange={(v) => setNewRole(v as ProjectMemberRole)} className="mt-1.5" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowAdd(false); setAddError(""); }}
                  className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white">Cancel</button>
                <button type="submit" disabled={isAdding}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50">
                  {isAdding ? "Adding..." : "Add member"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {removeTarget && (
        <ConfirmModal title="Remove member"
          message={`Remove ${removeTarget.user.first_name} ${removeTarget.user.last_name} from this project?`}
          confirmLabel="Remove" confirmVariant="danger" isLoading={isRemoving}
          onConfirm={handleRemove} onCancel={() => setRemoveTarget(null)} />
      )}
    </div>
  );
}

// --- Teams Tab ---

function TeamsTab({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const router = useRouter();
  const [projectTeams, setProjectTeams] = useState<ProjectTeam[]>([]);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [addError, setAddError] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ProjectTeam | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const fetchProjectTeams = useCallback(async () => {
    try {
      setProjectTeams((await listProjectTeams(projectId)).results);
    } finally { setIsLoading(false); }
  }, [projectId]);

  useEffect(() => { fetchProjectTeams(); }, [fetchProjectTeams]);

  const associatedTeamIds = new Set(projectTeams.map((pt) => pt.team.id));
  const availableTeams = allTeams.filter((t) => !associatedTeamIds.has(t.id));

  async function openAddModal() {
    setShowAdd(true);
    setAddError("");
    setSelectedTeamId("");
    try {
      setAllTeams((await listTeams()).results);
    } catch {
      setAddError("Failed to load teams.");
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!selectedTeamId) return;
    setAddError("");
    setIsAdding(true);
    try {
      await addProjectTeam(projectId, selectedTeamId);
      setShowAdd(false);
      setSelectedTeamId("");
      fetchProjectTeams();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })?.response?.data;
      setAddError(data ? Object.values(data).flat().join(" ") : "Failed to add team.");
    } finally { setIsAdding(false); }
  }

  async function handleRemove() {
    if (!removeTarget) return;
    setIsRemoving(true);
    try {
      await removeProjectTeam(projectId, removeTarget.team.id);
      setRemoveTarget(null);
      fetchProjectTeams();
    } finally { setIsRemoving(false); }
  }

  if (isLoading) return <p className="text-slate-500">Loading teams...</p>;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium text-white">Teams</h2>
        {canManage && (
          <button onClick={openAddModal}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500">Add team</button>
        )}
      </div>

      {projectTeams.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">No teams associated with this project yet.</p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-800/60 bg-slate-900">
          <table className="min-w-full divide-y divide-slate-800/60">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Team</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Added</th>
                {canManage && <th className="px-6 py-3 text-right text-xs font-medium uppercase text-slate-500">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {projectTeams.map((pt) => (
                <tr key={pt.id} className="hover:bg-slate-900/60">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-sm font-medium text-slate-400">
                        {pt.team.name[0]}
                      </div>
                      <div>
                        <button onClick={() => router.push(`/teams/${pt.team.id}`)}
                          className="text-sm font-medium text-slate-200 hover:text-indigo-400 transition-colors">
                          {pt.team.name}
                        </button>
                        <span className="ml-2 inline-block rounded-md bg-slate-800 px-1.5 py-0.5 text-xs font-mono text-slate-500">
                          {pt.team.identifier}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">{new Date(pt.created_at).toLocaleDateString()}</td>
                  {canManage && (
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => setRemoveTarget(pt)} className="text-sm text-red-400 transition-colors hover:text-red-300">Remove</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-xl border border-slate-800/60 bg-slate-900 p-6">
            <h2 className="mb-4 text-base font-medium tracking-tight text-white">Add team to project</h2>
            {addError && <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400"><svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6.25" /><path d="M8 5v3.5M8 10.5h.007" strokeLinecap="round" /></svg><span>{addError}</span></div>}
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400">Team</label>
                {availableTeams.length === 0 && !addError ? (
                  <p className="mt-1.5 text-sm text-slate-500">All teams are already associated with this project.</p>
                ) : (
                  <Select
                    options={availableTeams.map((t) => ({ value: t.id, label: t.name }))}
                    value={selectedTeamId}
                    onChange={(v) => setSelectedTeamId(v)}
                    placeholder="Select a team..."
                    className="mt-1.5"
                  />
                )}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowAdd(false); setAddError(""); }}
                  className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white">Cancel</button>
                <button type="submit" disabled={isAdding || !selectedTeamId}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50">
                  {isAdding ? "Adding..." : "Add team"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {removeTarget && (
        <ConfirmModal title="Remove team"
          message={`Remove "${removeTarget.team.name}" from this project?`}
          confirmLabel="Remove" confirmVariant="danger" isLoading={isRemoving}
          onConfirm={handleRemove} onCancel={() => setRemoveTarget(null)} />
      )}
    </div>
  );
}

// --- Setting Row ---

function SettingRow({
  label,
  value,
  displayValue,
  inputType = "text",
  mono,
  placeholder,
  maxLength,
  min,
  editing,
  draft,
  onDraftChange,
  onStartEdit,
  onSave,
  onCancel,
  isSaving,
  canManage,
}: {
  label: string;
  value: string;
  displayValue?: string;
  inputType?: "text" | "url" | "number";
  mono?: boolean;
  placeholder?: string;
  maxLength?: number;
  min?: number;
  editing: boolean;
  draft: string;
  onDraftChange: (v: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  canManage: boolean;
}) {
  const shown = displayValue ?? value;

  if (editing) {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5">
        <span className="w-44 shrink-0 text-sm font-medium text-slate-300">{label}</span>
        <input
          type={inputType}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave();
            if (e.key === "Escape") onCancel();
          }}
          maxLength={maxLength}
          min={min}
          placeholder={placeholder}
          autoFocus
          disabled={isSaving}
          className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
        />
        <div className="flex shrink-0 items-center gap-1.5">
          <button onClick={onSave} disabled={isSaving}
            className="rounded-md bg-indigo-600 p-1 text-white transition-colors hover:bg-indigo-500 disabled:opacity-50">
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 8l3.5 3.5L13 5" /></svg>
          </button>
          <button onClick={onCancel} disabled={isSaving}
            className="rounded-md border border-slate-700 p-1 text-slate-400 transition-colors hover:text-white">
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-center justify-between px-4 py-3">
      <span className="text-sm font-medium text-slate-300">{label}</span>
      <div className="flex items-center gap-2.5">
        <span className={`text-sm ${shown ? (mono ? "font-mono text-slate-400" : "text-slate-400") : "italic text-slate-600"}`}>
          {shown || "Not set"}
        </span>
        {canManage && (
          <button onClick={onStartEdit}
            className="text-slate-700 transition-colors hover:text-indigo-400 group-hover:text-slate-500">
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11.33 2a1.89 1.89 0 012.67 2.67L5.33 13.33 2 14l.67-3.33L11.33 2z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// --- Settings Tab ---

function SettingsTab({ projectId, canManage, onDeleted }: { projectId: string; canManage: boolean; onDeleted: () => void }) {
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [savingField, setSavingField] = useState<string | null>(null);

  // Agent automation
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [autoTaskDraft, setAutoTaskDraft] = useState("");
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [promptMessage, setPromptMessage] = useState("");

  // Delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const data = await getProjectSettings(projectId);
      setSettings(data);
    } finally { setIsLoading(false); }
  }, [projectId]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  function fullPayload(override: Record<string, unknown>) {
    if (!settings) return override;
    return {
      repository_url: settings.repository_url,
      default_branch: settings.default_branch,
      branch_naming_convention: settings.branch_naming_convention,
      required_reviewers_count: settings.required_reviewers_count,
      auto_close_completed_issues: settings.auto_close_completed_issues,
      issue_prefix: settings.issue_prefix,
      estimation_method: settings.estimation_method,
      auto_task_prompt_template: settings.auto_task_prompt_template,
      ...override,
    };
  }

  async function saveField(field: string, value: unknown) {
    if (!settings) return;
    setSavingField(field);
    try {
      const updated = await updateProjectSettings(projectId, fullPayload({ [field]: value }));
      setSettings(updated);
      setEditingField(null);
    } catch { /* stay in edit mode on error */ }
    finally { setSavingField(null); }
  }

  function startEdit(field: string, currentValue: string) {
    setEditingField(field);
    setDraftValue(currentValue);
  }

  function cancelEdit() {
    setEditingField(null);
    setDraftValue("");
  }

  function handleRowSave(field: string, inputType: string) {
    const val = inputType === "number" ? (parseInt(draftValue) || 0) : draftValue;
    saveField(field, val);
  }

  async function savePrompt() {
    if (!settings) return;
    setIsSavingPrompt(true);
    setPromptMessage("");
    try {
      const updated = await updateProjectSettings(projectId, fullPayload({ auto_task_prompt_template: autoTaskDraft }));
      setSettings(updated);
      setEditingPrompt(false);
      setPromptMessage("Saved.");
    } catch {
      setPromptMessage("Failed to save.");
    } finally { setIsSavingPrompt(false); }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await deleteProject(projectId);
      onDeleted();
    } finally { setIsDeleting(false); }
  }

  if (isLoading) return <p className="text-slate-500">Loading settings...</p>;
  if (!settings) return <p className="text-red-400">Failed to load settings.</p>;

  const estimationLabel = ESTIMATION_OPTIONS.find((o) => o.value === settings.estimation_method)?.label ?? settings.estimation_method;

  const repoRows: { field: string; label: string; value: string; inputType: "text" | "url" | "number"; mono?: boolean; placeholder?: string }[] = [
    { field: "repository_url", label: "Repository URL", value: settings.repository_url, inputType: "url", mono: true, placeholder: "https://github.com/..." },
    { field: "default_branch", label: "Default branch", value: settings.default_branch, inputType: "text", mono: true },
    { field: "branch_naming_convention", label: "Branch convention", value: settings.branch_naming_convention, inputType: "text", mono: true, placeholder: "{type}/{identifier}" },
  ];

  const workflowRows: { field: string; label: string; value: string; inputType: "text" | "url" | "number"; mono?: boolean; maxLength?: number; min?: number }[] = [
    { field: "required_reviewers_count", label: "Required reviewers", value: String(settings.required_reviewers_count), inputType: "number", min: 0 },
    { field: "issue_prefix", label: "Issue prefix", value: settings.issue_prefix, inputType: "text", mono: true, maxLength: 10 },
  ];

  return (
    <div className="max-w-2xl">
      {/* Repository */}
      <div>
        <h3 className="text-[10px] font-medium uppercase tracking-wider text-slate-600">Repository</h3>
        <div className="mt-2 divide-y divide-slate-800/40 rounded-xl border border-slate-800/60 bg-slate-900">
          {repoRows.map((row) => (
            <SettingRow
              key={row.field}
              label={row.label}
              value={row.value}
              inputType={row.inputType}
              mono={row.mono}
              placeholder={row.placeholder}
              editing={editingField === row.field}
              draft={draftValue}
              onDraftChange={setDraftValue}
              onStartEdit={() => startEdit(row.field, row.value)}
              onSave={() => handleRowSave(row.field, row.inputType)}
              onCancel={cancelEdit}
              isSaving={savingField === row.field}
              canManage={canManage}
            />
          ))}
        </div>
      </div>

      {/* Workflow */}
      <div className="mt-6">
        <h3 className="text-[10px] font-medium uppercase tracking-wider text-slate-600">Workflow</h3>
        <div className="mt-2 divide-y divide-slate-800/40 rounded-xl border border-slate-800/60 bg-slate-900">
          {workflowRows.map((row) => (
            <SettingRow
              key={row.field}
              label={row.label}
              value={row.value}
              inputType={row.inputType}
              mono={row.mono}
              maxLength={row.maxLength}
              min={row.min}
              editing={editingField === row.field}
              draft={draftValue}
              onDraftChange={setDraftValue}
              onStartEdit={() => startEdit(row.field, row.value)}
              onSave={() => handleRowSave(row.field, row.inputType)}
              onCancel={cancelEdit}
              isSaving={savingField === row.field}
              canManage={canManage}
            />
          ))}

          {/* Estimation method — inline select */}
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-medium text-slate-300">Estimation method</span>
            {canManage ? (
              <Select
                options={ESTIMATION_OPTIONS}
                value={settings.estimation_method}
                onChange={(v) => saveField("estimation_method", v)}
                             />
            ) : (
              <span className="text-sm text-slate-400">{estimationLabel}</span>
            )}
          </div>

          {/* Auto-close toggle */}
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-medium text-slate-300">Auto-close completed issues</span>
            <button
              type="button"
              role="switch"
              aria-checked={settings.auto_close_completed_issues}
              disabled={!canManage || savingField === "auto_close_completed_issues"}
              onClick={() => saveField("auto_close_completed_issues", !settings.auto_close_completed_issues)}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                settings.auto_close_completed_issues ? "bg-indigo-600" : "bg-slate-700"
              } ${!canManage ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
            >
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                settings.auto_close_completed_issues ? "translate-x-[18px]" : "translate-x-[3px]"
              }`} />
            </button>
          </div>
        </div>
      </div>

      {/* Agent Automation */}
      <div className="mt-6">
        <h3 className="text-[10px] font-medium uppercase tracking-wider text-slate-600">Agent Automation</h3>
        <div className="mt-2 rounded-xl border border-slate-800/60 bg-slate-900 p-5">
          <p className="text-sm text-slate-500">When an issue moves from Backlog to Todo, an agent task is created automatically using this prompt template.</p>

          <div className="mt-4">
            {editingPrompt ? (
              <>
                <textarea
                  value={autoTaskDraft}
                  onChange={(e) => setAutoTaskDraft(e.target.value)}
                  rows={3}
                  placeholder="Use toony skill and implement {issue_identifier}"
                  autoFocus
                  disabled={isSavingPrompt}
                  className="block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {["{issue_id}", "{issue_identifier}", "{issue_description}"].map((v) => (
                    <code key={v} className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-500">{v}</code>
                  ))}
                  <span className="text-xs text-slate-600">— available variables</span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button onClick={savePrompt} disabled={isSavingPrompt}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50">
                    {isSavingPrompt ? "Saving..." : "Save"}
                  </button>
                  <button onClick={() => setEditingPrompt(false)} disabled={isSavingPrompt}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:text-white">
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <div className="group flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  {settings.auto_task_prompt_template ? (
                    <p className="whitespace-pre-wrap rounded-lg bg-slate-950 px-3 py-2 font-mono text-sm leading-relaxed text-slate-400">
                      {settings.auto_task_prompt_template}
                    </p>
                  ) : (
                    <p className="text-sm italic text-slate-600">No template configured. Global default will be used.</p>
                  )}
                </div>
                {canManage && (
                  <button
                    onClick={() => { setAutoTaskDraft(settings.auto_task_prompt_template || ""); setEditingPrompt(true); }}
                    className="mt-1 shrink-0 text-slate-700 transition-colors hover:text-indigo-400 group-hover:text-slate-500"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11.33 2a1.89 1.89 0 012.67 2.67L5.33 13.33 2 14l.67-3.33L11.33 2z" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>

          {promptMessage && !editingPrompt && (
            <p className={`mt-3 text-xs ${promptMessage.includes("Failed") ? "text-red-400" : "text-emerald-400"}`}>{promptMessage}</p>
          )}
        </div>
      </div>

      {/* Danger Zone */}
      {canManage && (
        <div className="mt-8 rounded-xl border border-red-500/20 bg-slate-900 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-red-400">Delete project</h3>
              <p className="mt-0.5 text-xs text-slate-500">Permanently delete this project and all its data.</p>
            </div>
            <button onClick={() => setShowDeleteConfirm(true)}
              className="shrink-0 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10">
              Delete project
            </button>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <ConfirmModal title="Delete project"
          message="This action cannot be undone. All issues, milestones, and cycles will be permanently deleted."
          confirmLabel="Delete" confirmVariant="danger" isLoading={isDeleting}
          onConfirm={handleDelete} onCancel={() => setShowDeleteConfirm(false)} />
      )}
    </div>
  );
}

// --- Issues Tab ---

function IssuesTab({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const router = useRouter();
  const [issues, setIssues] = useState<IssueList[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<IssueFilters>({});
  const [showCreate, setShowCreate] = useState(false);

  const handleWsEvent = useCallback((event: ProjectWsEvent) => {
    switch (event.type) {
      case "issue.created":
        setIssues((prev) => {
          if (prev.some((i) => i.id === event.data.id)) return prev;
          return [event.data, ...prev];
        });
        break;
      case "issue.updated":
        setIssues((prev) =>
          prev.map((i) => (i.id === event.data.id ? event.data : i)),
        );
        break;
      case "issue.deleted":
        setIssues((prev) => prev.filter((i) => i.id !== event.data.id));
        break;
    }
  }, []);

  useProjectWebSocket({ projectId, onEvent: handleWsEvent });

  const fetchIssues = useCallback(async () => {
    try {
      setIssues((await listIssues(projectId, filters)).results);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, filters]);

  const fetchMetadata = useCallback(async () => {
    const [m, ms, cs, ls] = await Promise.all([
      listProjectMembers(projectId),
      listMilestones(projectId),
      listCycles(projectId),
      listLabels(),
    ]);
    setMembers(m.results);
    setMilestones(ms.results);
    setCycles(cs.results);
    setLabels(ls.results);
  }, [projectId]);

  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  async function handleStatusChange(issue: IssueList, status: IssueStatus) {
    setIssues((prev) =>
      prev.map((i) => (i.id === issue.id ? { ...i, status } : i)),
    );
    try {
      await updateIssue(projectId, issue.id, { status });
    } catch {
      fetchIssues();
    }
  }

  if (isLoading) return <p className="text-slate-500">Loading issues...</p>;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <FilterBar
          filters={filters}
          onChange={setFilters}
          members={members}
          milestones={milestones}
          cycles={cycles}
          labels={labels}
        />
        {canManage && (
          <button
            onClick={() => setShowCreate(true)}
            className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            Create issue
          </button>
        )}
      </div>

      {/* Board */}
      <div className="mt-4">
        <KanbanBoard
          issues={issues}
          onIssueClick={(issue) => router.push(`/projects/${projectId}/issues/${issue.id}`)}
          onStatusChange={canManage ? handleStatusChange : undefined}
        />
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateIssueModal
          projectId={projectId}
          members={members}
          milestones={milestones}
          cycles={cycles}
          labels={labels}
          onClose={() => setShowCreate(false)}
          onCreated={fetchIssues}
        />
      )}

    </div>
  );
}
