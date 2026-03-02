"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useOrg } from "@/contexts/org-context";
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
import { listLabels } from "@/lib/api/labels";
import { listIssues, updateIssue } from "@/lib/api/issues";
import { listResources, createResource, updateResource, deleteResource } from "@/lib/api/resources";
import { canCreateProject, canManageIssues } from "@/lib/roles";
import { ConfirmModal } from "@/components/confirm-modal";
import { StatusBadge } from "@/components/status-badge";
import { PriorityBadge } from "@/components/priority-badge";
import { FilterBar } from "@/components/issues/filter-bar";
import { KanbanBoard } from "@/components/issues/kanban-board";
import { IssuesList } from "@/components/issues/issues-list";
import { CreateIssueModal } from "@/components/issues/create-issue-modal";
import { IssueDetailModal } from "@/components/issues/issue-detail-modal";
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
  IssuePriority,
  IssueFilters,
  Label,
  ProjectWsEvent,
  ProjectResource,
  ResourceType,
} from "@/types";
import { useProjectWebSocket } from "@/hooks/use-project-websocket";

type Tab = "overview" | "issues" | "milestones" | "cycles" | "members" | "settings";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "issues", label: "Issues" },
  { key: "milestones", label: "Milestones" },
  { key: "cycles", label: "Cycles" },
  { key: "members", label: "Members" },
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
  const orgSlug = params.orgSlug as string;
  const projectSlug = params.projectSlug as string;
  const { currentMembership } = useOrg();

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const canManage = canCreateProject(currentMembership?.role);
  const canEditIssues = canManageIssues(currentMembership?.role);

  const fetchProject = useCallback(async () => {
    try {
      const data = await getProject(orgSlug, projectSlug);
      setProject(data);
    } finally {
      setIsLoading(false);
    }
  }, [orgSlug, projectSlug]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  if (isLoading) return <p className="text-slate-500">Loading project...</p>;
  if (!project) return <p className="text-red-400">Project not found.</p>;

  return (
    <div>
      {/* Back link */}
      <button
        onClick={() => router.push(`/${orgSlug}/projects`)}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-300"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 12L6 8l4-4" />
        </svg>
        Projects
      </button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-medium tracking-tight text-white">{project.name}</h1>
            <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs font-mono text-slate-400">
              {project.team.identifier}
            </span>
          </div>
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
          {project.short_summary && (
            <p className="mt-2 text-sm text-slate-400">{project.short_summary}</p>
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
            orgSlug={orgSlug}
            projectSlug={projectSlug}
            canManage={canManage}
            onUpdated={fetchProject}
          />
        )}
        {activeTab === "issues" && (
          <IssuesTab orgSlug={orgSlug} projectSlug={projectSlug} projectId={project.id} canManage={canEditIssues} />
        )}
        {activeTab === "milestones" && (
          <MilestonesTab orgSlug={orgSlug} projectSlug={projectSlug} canManage={canManage} />
        )}
        {activeTab === "cycles" && (
          <CyclesTab orgSlug={orgSlug} projectSlug={projectSlug} canManage={canManage} />
        )}
        {activeTab === "members" && (
          <MembersTab orgSlug={orgSlug} projectSlug={projectSlug} canManage={canManage} />
        )}
        {activeTab === "settings" && (
          <SettingsTab orgSlug={orgSlug} projectSlug={projectSlug} canManage={canManage} onDeleted={() => router.push(`/${orgSlug}/projects`)} />
        )}
      </div>
    </div>
  );
}

// --- Overview Tab ---

function OverviewTab({
  project,
  orgSlug,
  projectSlug,
  canManage,
  onUpdated,
}: {
  project: ProjectDetail;
  orgSlug: string;
  projectSlug: string;
  canManage: boolean;
  onUpdated: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [shortSummary, setShortSummary] = useState(project.short_summary);
  const [description, setDescription] = useState(project.description);
  const [status, setStatus] = useState(project.status);
  const [priority, setPriority] = useState(project.priority);
  const [startDate, setStartDate] = useState(project.start_date || "");
  const [targetDate, setTargetDate] = useState(project.target_date || "");
  const [isSaving, setIsSaving] = useState(false);

  // Resources
  const [resources, setResources] = useState<ProjectResource[]>([]);
  // undefined = closed, null = creating, ProjectResource = editing
  const [resourceModalTarget, setResourceModalTarget] = useState<ProjectResource | null | undefined>(undefined);
  const [isDeletingResource, setIsDeletingResource] = useState<string | null>(null);

  const fetchResources = useCallback(async () => {
    try {
      setResources((await listResources(orgSlug, projectSlug)).results);
    } catch { /* ignore */ }
  }, [orgSlug, projectSlug]);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateProject(orgSlug, projectSlug, {
        name,
        short_summary: shortSummary,
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

  if (isEditing) {
    return (
      <form onSubmit={handleSave} className="max-w-2xl space-y-4">
        <div className="rounded-xl border border-slate-800/60 bg-slate-900 p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400">Name</label>
            <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
              className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400">Short summary</label>
            <input type="text" value={shortSummary} onChange={(e) => setShortSummary(e.target.value)} maxLength={255} placeholder="A brief tagline for the project"
              className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400">Status</label>
              <Select options={PROJECT_STATUS_OPTIONS} value={status} onChange={(v) => setStatus(v as ProjectStatus)} className="mt-1.5" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400">Priority</label>
              <Select options={PROJECT_PRIORITY_OPTIONS} value={priority} onChange={(v) => setPriority(v as ProjectPriority)} className="mt-1.5" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400">Start date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400">Target date</label>
              <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)}
                className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors" />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={isSaving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50">
              {isSaving ? "Saving..." : "Save"}
            </button>
            <button type="button" onClick={() => setIsEditing(false)}
              className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white">Cancel</button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <div className="max-w-3xl">
      {project.description && (
        <p className="text-sm leading-relaxed text-slate-400">{project.description}</p>
      )}

      <div className={`${project.description ? "mt-6" : ""} grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-slate-800/60 bg-slate-800/30`}>
        <div className="bg-slate-950 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Team</p>
          <p className="mt-2 text-sm font-medium text-slate-200">{project.team.name}</p>
          <span className="mt-1 inline-block rounded-md bg-slate-800 px-1.5 py-0.5 text-xs font-mono text-slate-500">{project.team.identifier}</span>
        </div>
        <div className="bg-slate-950 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Lead</p>
          <p className="mt-2 text-sm font-medium text-slate-200">
            {project.lead ? `${project.lead.first_name} ${project.lead.last_name}` : "\u2014"}
          </p>
        </div>
        <div className="bg-slate-950 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Issues</p>
          <p className="mt-2 text-lg font-medium tracking-tight text-slate-200">{project.issue_count}</p>
        </div>
        <div className="bg-slate-950 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Start date</p>
          <p className="mt-2 text-sm font-medium text-slate-200">
            {project.start_date ? new Date(project.start_date).toLocaleDateString() : "\u2014"}
          </p>
        </div>
        <div className="bg-slate-950 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Target date</p>
          <p className="mt-2 text-sm font-medium text-slate-200">
            {project.target_date ? new Date(project.target_date).toLocaleDateString() : "\u2014"}
          </p>
        </div>
        <div className="bg-slate-950 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Members</p>
          <p className="mt-2 text-lg font-medium tracking-tight text-slate-200">{project.member_count}</p>
        </div>
      </div>

      {canManage && (
        <div className="mt-6">
          <button onClick={() => setIsEditing(true)}
            className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white">
            Edit project
          </button>
        </div>
      )}

      {/* Resources */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-300">Resources</h3>
          {canManage && (
            <button onClick={() => setResourceModalTarget(null)}
              className="text-xs font-medium text-indigo-400 transition-colors hover:text-indigo-300">
              + Add resource
            </button>
          )}
        </div>

        {resources.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No resources yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {resources.map((res) => (
              <div key={res.id} className="flex items-center justify-between rounded-lg border border-slate-800/60 bg-slate-900/50 px-4 py-3">
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
                          await deleteResource(orgSlug, projectSlug, res.id);
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
      </div>

      {resourceModalTarget !== undefined && (
        <ResourceModal
          orgSlug={orgSlug}
          projectSlug={projectSlug}
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
  orgSlug,
  projectSlug,
  resource,
  onClose,
  onSaved,
}: {
  orgSlug: string;
  projectSlug: string;
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
        await updateResource(orgSlug, projectSlug, resource.id, { title, url, type });
      } else {
        await createResource(orgSlug, projectSlug, { title, url, type });
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

function MilestonesTab({ orgSlug, projectSlug, canManage }: { orgSlug: string; projectSlug: string; canManage: boolean }) {
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
      setMilestones((await listMilestones(orgSlug, projectSlug)).results);
    } finally {
      setIsLoading(false);
    }
  }, [orgSlug, projectSlug]);

  useEffect(() => { fetchMilestones(); }, [fetchMilestones]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setIsCreating(true);
    try {
      await createMilestone(orgSlug, projectSlug, {
        name: newName, description: newDescription, target_date: newTargetDate || null,
      });
      setShowCreate(false);
      setNewName(""); setNewDescription(""); setNewTargetDate("");
      fetchMilestones();
    } finally { setIsCreating(false); }
  }

  async function handleStatusChange(m: Milestone, status: MilestoneStatus) {
    await updateMilestone(orgSlug, projectSlug, m.id, { status });
    fetchMilestones();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteMilestone(orgSlug, projectSlug, deleteTarget.id);
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

function CyclesTab({ orgSlug, projectSlug, canManage }: { orgSlug: string; projectSlug: string; canManage: boolean }) {
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
      setCycles((await listCycles(orgSlug, projectSlug)).results);
    } finally { setIsLoading(false); }
  }, [orgSlug, projectSlug]);

  useEffect(() => { fetchCycles(); }, [fetchCycles]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setIsCreating(true);
    try {
      await createCycle(orgSlug, projectSlug, { name: newName, start_date: newStart, end_date: newEnd });
      setShowCreate(false);
      setNewName(""); setNewStart(""); setNewEnd("");
      fetchCycles();
    } finally { setIsCreating(false); }
  }

  async function handleStatusChange(c: Cycle, status: CycleStatus) {
    await updateCycle(orgSlug, projectSlug, c.id, { status });
    fetchCycles();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteCycle(orgSlug, projectSlug, deleteTarget.id);
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

function MembersTab({ orgSlug, projectSlug, canManage }: { orgSlug: string; projectSlug: string; canManage: boolean }) {
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
      setMembers((await listProjectMembers(orgSlug, projectSlug)).results);
    } finally { setIsLoading(false); }
  }, [orgSlug, projectSlug]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAddError("");
    setIsAdding(true);
    try {
      await addProjectMember(orgSlug, projectSlug, { email: newEmail, role: newRole });
      setShowAdd(false); setNewEmail(""); setNewRole("CONTRIBUTOR");
      fetchMembers();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })?.response?.data;
      setAddError(data ? Object.values(data).flat().join(" ") : "Failed to add member.");
    } finally { setIsAdding(false); }
  }

  async function handleRoleChange(member: ProjectMember, role: ProjectMemberRole) {
    await updateProjectMemberRole(orgSlug, projectSlug, member.user.id, { role });
    fetchMembers();
  }

  async function handleRemove() {
    if (!removeTarget) return;
    setIsRemoving(true);
    try {
      await removeProjectMember(orgSlug, projectSlug, removeTarget.user.id);
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

// --- Settings Tab ---

function SettingsTab({ orgSlug, projectSlug, canManage, onDeleted }: { orgSlug: string; projectSlug: string; canManage: boolean; onDeleted: () => void }) {
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [repoUrl, setRepoUrl] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("main");
  const [branchConvention, setBranchConvention] = useState("");
  const [reviewers, setReviewers] = useState(1);
  const [autoClose, setAutoClose] = useState(false);
  const [prefixOverride, setPrefixOverride] = useState("");
  const [estimation, setEstimation] = useState<EstimationMethod>("STORY_POINTS");

  const fetchSettings = useCallback(async () => {
    try {
      const data = await getProjectSettings(orgSlug, projectSlug);
      setSettings(data);
      setRepoUrl(data.repository_url);
      setDefaultBranch(data.default_branch);
      setBranchConvention(data.branch_naming_convention);
      setReviewers(data.required_reviewers_count);
      setAutoClose(data.auto_close_completed_issues);
      setPrefixOverride(data.issue_prefix_override);
      setEstimation(data.estimation_method);
    } finally { setIsLoading(false); }
  }, [orgSlug, projectSlug]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaveMessage("");
    setIsSaving(true);
    try {
      const updated = await updateProjectSettings(orgSlug, projectSlug, {
        repository_url: repoUrl,
        default_branch: defaultBranch,
        branch_naming_convention: branchConvention,
        required_reviewers_count: reviewers,
        auto_close_completed_issues: autoClose,
        issue_prefix_override: prefixOverride,
        estimation_method: estimation,
      });
      setSettings(updated);
      setSaveMessage("Settings saved.");
    } catch {
      setSaveMessage("Failed to save settings.");
    } finally { setIsSaving(false); }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await deleteProject(orgSlug, projectSlug);
      onDeleted();
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) return <p className="text-slate-500">Loading settings...</p>;
  if (!settings) return <p className="text-red-400">Failed to load settings.</p>;

  return (
    <div className="max-w-2xl">
      <form onSubmit={handleSave} className="space-y-6">
        <div className="rounded-xl border border-slate-800/60 bg-slate-900 p-6">
          <h2 className="text-base font-medium text-white">Project Settings</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400">Repository URL</label>
              <input type="url" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} disabled={!canManage}
                className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors disabled:text-slate-500 disabled:bg-slate-900" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-400">Default branch</label>
                <input type="text" value={defaultBranch} onChange={(e) => setDefaultBranch(e.target.value)} disabled={!canManage}
                  className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors disabled:text-slate-500 disabled:bg-slate-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400">Branch convention</label>
                <input type="text" value={branchConvention} onChange={(e) => setBranchConvention(e.target.value)} disabled={!canManage}
                  placeholder="{type}/{identifier}" className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors disabled:text-slate-500 disabled:bg-slate-900" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-400">Required reviewers</label>
                <input type="number" min={0} value={reviewers} onChange={(e) => setReviewers(parseInt(e.target.value) || 0)} disabled={!canManage}
                  className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors disabled:text-slate-500 disabled:bg-slate-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400">Issue prefix override</label>
                <input type="text" maxLength={10} value={prefixOverride} onChange={(e) => setPrefixOverride(e.target.value)} disabled={!canManage}
                  className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors disabled:text-slate-500 disabled:bg-slate-900" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400">Estimation method</label>
              <Select options={ESTIMATION_OPTIONS} value={estimation} onChange={(v) => setEstimation(v as EstimationMethod)} disabled={!canManage} className="mt-1.5" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="autoClose" checked={autoClose} onChange={(e) => setAutoClose(e.target.checked)} disabled={!canManage}
                className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500" />
              <label htmlFor="autoClose" className="text-sm text-slate-300">Auto-close completed issues</label>
            </div>
          </div>

          {canManage && (
            <div className="mt-6">
              {saveMessage && (
                <p className={`mb-3 text-sm ${saveMessage.includes("Failed") ? "text-red-400" : "text-emerald-400"}`}>{saveMessage}</p>
              )}
              <button type="submit" disabled={isSaving}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50">
                {isSaving ? "Saving..." : "Save settings"}</button>
            </div>
          )}
        </div>
      </form>

      {canManage && (
        <div className="mt-8 rounded-xl border border-red-500/20 bg-slate-900 p-6">
          <h2 className="text-base font-medium text-red-400">Danger zone</h2>
          <p className="mt-1 text-sm text-slate-400">Permanently delete this project and all its data.</p>
          <button type="button" onClick={() => setShowDeleteConfirm(true)}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500">Delete project</button>
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

type IssueViewMode = "board" | "list";

function IssuesTab({ orgSlug, projectSlug, projectId, canManage }: { orgSlug: string; projectSlug: string; projectId: string; canManage: boolean }) {
  const [issues, setIssues] = useState<IssueList[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<IssueViewMode>("board");
  const [filters, setFilters] = useState<IssueFilters>({});
  const [showCreate, setShowCreate] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [latestWsEvent, setLatestWsEvent] = useState<ProjectWsEvent | null>(null);

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
      case "comment.created":
      case "comment.updated":
      case "comment.deleted":
        setLatestWsEvent(event);
        break;
    }
  }, []);

  useProjectWebSocket({ projectId, onEvent: handleWsEvent });

  const fetchIssues = useCallback(async () => {
    try {
      setIssues((await listIssues(orgSlug, projectSlug, filters)).results);
    } finally {
      setIsLoading(false);
    }
  }, [orgSlug, projectSlug, filters]);

  const fetchMetadata = useCallback(async () => {
    const [m, ms, cs, ls] = await Promise.all([
      listProjectMembers(orgSlug, projectSlug),
      listMilestones(orgSlug, projectSlug),
      listCycles(orgSlug, projectSlug),
      listLabels(orgSlug),
    ]);
    setMembers(m.results);
    setMilestones(ms.results);
    setCycles(cs.results);
    setLabels(ls.results);
  }, [orgSlug, projectSlug]);

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
      await updateIssue(orgSlug, projectSlug, issue.identifier, { status });
    } catch {
      fetchIssues();
    }
  }

  async function handlePriorityChange(issue: IssueList, priority: IssuePriority) {
    await updateIssue(orgSlug, projectSlug, issue.identifier, { priority });
    fetchIssues();
  }

  if (isLoading) return <p className="text-slate-500">Loading issues...</p>;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-slate-800/60">
            <button
              onClick={() => setViewMode("board")}
              className={`px-3 py-1.5 text-sm ${viewMode === "board" ? "bg-slate-800 font-medium text-white" : "text-slate-500 hover:text-slate-300"}`}
            >
              Board
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`border-l border-slate-800/60 px-3 py-1.5 text-sm ${viewMode === "list" ? "bg-slate-800 font-medium text-white" : "text-slate-500 hover:text-slate-300"}`}
            >
              List
            </button>
          </div>
        </div>
        {canManage && (
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            Create issue
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="mt-4">
        <FilterBar
          filters={filters}
          onChange={setFilters}
          members={members}
          milestones={milestones}
          cycles={cycles}
          labels={labels}
        />
      </div>

      {/* View */}
      <div className="mt-4">
        {viewMode === "board" ? (
          <KanbanBoard
            issues={issues}
            onIssueClick={(issue) => setSelectedIssueId(issue.identifier)}
            onStatusChange={canManage ? handleStatusChange : undefined}
          />
        ) : (
          <IssuesList
            issues={issues}
            onIssueClick={(issue) => setSelectedIssueId(issue.identifier)}
            onStatusChange={canManage ? handleStatusChange : undefined}
            onPriorityChange={canManage ? handlePriorityChange : undefined}
          />
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateIssueModal
          orgSlug={orgSlug}
          projectSlug={projectSlug}
          members={members}
          milestones={milestones}
          cycles={cycles}
          labels={labels}
          onClose={() => setShowCreate(false)}
          onCreated={fetchIssues}
        />
      )}

      {/* Detail modal */}
      {selectedIssueId && (
        <IssueDetailModal
          orgSlug={orgSlug}
          projectSlug={projectSlug}
          identifier={selectedIssueId}
          members={members}
          milestones={milestones}
          cycles={cycles}
          labels={labels}
          onClose={() => setSelectedIssueId(null)}
          onUpdated={fetchIssues}
          wsEvent={latestWsEvent}
        />
      )}
    </div>
  );
}
