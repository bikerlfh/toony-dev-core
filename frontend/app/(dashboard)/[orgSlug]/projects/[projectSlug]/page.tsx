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
import { canCreateProject } from "@/lib/roles";
import { ConfirmModal } from "@/components/confirm-modal";
import { StatusBadge } from "@/components/status-badge";
import { PriorityBadge } from "@/components/priority-badge";
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
} from "@/types";

type Tab = "overview" | "milestones" | "cycles" | "members" | "settings";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
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

const PROJECT_MEMBER_ROLES: ProjectMemberRole[] = ["LEAD", "CONTRIBUTOR", "REVIEWER"];

const MEMBER_ROLE_COLORS: Record<ProjectMemberRole, string> = {
  LEAD: "bg-purple-100 text-purple-800",
  CONTRIBUTOR: "bg-blue-100 text-blue-800",
  REVIEWER: "bg-green-100 text-green-800",
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

  if (isLoading) return <p className="text-gray-500">Loading project...</p>;
  if (!project) return <p className="text-red-500">Project not found.</p>;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          <div className="mt-1 flex items-center gap-2">
            <StatusBadge status={project.status} />
            <PriorityBadge priority={project.priority} />
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-mono text-gray-600">
              {project.team.identifier}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
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
            onDeleted={() => router.push(`/${orgSlug}/projects`)}
          />
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
          <SettingsTab orgSlug={orgSlug} projectSlug={projectSlug} canManage={canManage} />
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
  onDeleted,
}: {
  project: ProjectDetail;
  orgSlug: string;
  projectSlug: string;
  canManage: boolean;
  onUpdated: () => void;
  onDeleted: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [status, setStatus] = useState(project.status);
  const [priority, setPriority] = useState(project.priority);
  const [startDate, setStartDate] = useState(project.start_date || "");
  const [targetDate, setTargetDate] = useState(project.target_date || "");
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateProject(orgSlug, projectSlug, {
        name,
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

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await deleteProject(orgSlug, projectSlug);
      onDeleted();
    } finally {
      setIsDeleting(false);
    }
  }

  if (isEditing) {
    return (
      <form onSubmit={handleSave} className="max-w-2xl space-y-4">
        <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none">
                {PROJECT_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as ProjectPriority)}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none">
                {PROJECT_PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Start date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Target date</label>
              <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={isSaving}
              className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50">
              {isSaving ? "Saving..." : "Save"}
            </button>
            <button type="button" onClick={() => setIsEditing(false)}
              className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-start justify-between">
          <div>
            {project.description && (
              <p className="text-sm text-gray-600">{project.description}</p>
            )}
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-gray-500">Lead</dt>
                <dd className="mt-1 font-medium text-gray-900">
                  {project.lead ? `${project.lead.first_name} ${project.lead.last_name}` : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Team</dt>
                <dd className="mt-1 font-medium text-gray-900">{project.team.name}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Start date</dt>
                <dd className="mt-1 font-medium text-gray-900">
                  {project.start_date ? new Date(project.start_date).toLocaleDateString() : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Target date</dt>
                <dd className="mt-1 font-medium text-gray-900">
                  {project.target_date ? new Date(project.target_date).toLocaleDateString() : "—"}
                </dd>
              </div>
            </dl>
          </div>
          {canManage && (
            <button onClick={() => setIsEditing(true)}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Edit</button>
          )}
        </div>
      </div>

      {canManage && (
        <div className="mt-8 rounded-lg border border-red-200 bg-white p-6">
          <h2 className="text-lg font-medium text-red-900">Danger zone</h2>
          <p className="mt-1 text-sm text-gray-600">Permanently delete this project and all its data.</p>
          <button type="button" onClick={() => setShowDeleteConfirm(true)}
            className="mt-4 rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700">Delete project</button>
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
      setMilestones(await listMilestones(orgSlug, projectSlug));
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

  if (isLoading) return <p className="text-gray-500">Loading milestones...</p>;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Milestones</h2>
        {canManage && (
          <button onClick={() => setShowCreate(true)}
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700">Add milestone</button>
        )}
      </div>

      {milestones.length === 0 ? (
        <p className="mt-4 text-gray-500">No milestones yet.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {milestones.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4">
              <div>
                <p className="font-medium text-gray-900">{m.name}</p>
                <div className="mt-1 flex items-center gap-2">
                  {canManage ? (
                    <select value={m.status} onChange={(e) => handleStatusChange(m, e.target.value as MilestoneStatus)}
                      className="rounded border border-gray-300 px-2 py-0.5 text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none">
                      {MILESTONE_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : (
                    <StatusBadge status={m.status} type="milestone" />
                  )}
                  {m.target_date && <span className="text-xs text-gray-500">Target: {new Date(m.target_date).toLocaleDateString()}</span>}
                </div>
              </div>
              {canManage && (
                <button onClick={() => setDeleteTarget(m)} className="text-sm text-red-600 hover:underline">Delete</button>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Add milestone</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input type="text" required value={newName} onChange={(e) => setNewName(e.target.value)}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} rows={2}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Target date</label>
                <input type="date" value={newTargetDate} onChange={(e) => setNewTargetDate(e.target.value)}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={isCreating}
                  className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50">
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
      setCycles(await listCycles(orgSlug, projectSlug));
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

  if (isLoading) return <p className="text-gray-500">Loading cycles...</p>;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Cycles</h2>
        {canManage && (
          <button onClick={() => setShowCreate(true)}
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700">Add cycle</button>
        )}
      </div>

      {cycles.length === 0 ? (
        <p className="mt-4 text-gray-500">No cycles yet.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {cycles.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4">
              <div>
                <p className="font-medium text-gray-900">
                  <span className="mr-2 text-gray-400">#{c.number}</span>{c.name}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  {canManage ? (
                    <select value={c.status} onChange={(e) => handleStatusChange(c, e.target.value as CycleStatus)}
                      className="rounded border border-gray-300 px-2 py-0.5 text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none">
                      {CYCLE_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : (
                    <StatusBadge status={c.status} type="cycle" />
                  )}
                  <span className="text-xs text-gray-500">
                    {new Date(c.start_date).toLocaleDateString()} — {new Date(c.end_date).toLocaleDateString()}
                  </span>
                </div>
              </div>
              {canManage && (
                <button onClick={() => setDeleteTarget(c)} className="text-sm text-red-600 hover:underline">Delete</button>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Add cycle</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input type="text" required value={newName} onChange={(e) => setNewName(e.target.value)}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Start date</label>
                  <input type="date" required value={newStart} onChange={(e) => setNewStart(e.target.value)}
                    className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">End date</label>
                  <input type="date" required value={newEnd} onChange={(e) => setNewEnd(e.target.value)}
                    className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={isCreating}
                  className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50">
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
      setMembers(await listProjectMembers(orgSlug, projectSlug));
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

  if (isLoading) return <p className="text-gray-500">Loading members...</p>;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Members</h2>
        {canManage && (
          <button onClick={() => setShowAdd(true)}
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700">Add member</button>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Member</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Joined</th>
              {canManage && <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {members.map((m) => (
              <tr key={m.id}>
                <td className="px-6 py-4">
                  <div className="flex items-center">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600">
                      {m.user.first_name?.[0]}{m.user.last_name?.[0]}
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-900">{m.user.first_name} {m.user.last_name}</p>
                      <p className="text-sm text-gray-500">{m.user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  {canManage ? (
                    <select value={m.role} onChange={(e) => handleRoleChange(m, e.target.value as ProjectMemberRole)}
                      className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none">
                      {PROJECT_MEMBER_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : (
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${MEMBER_ROLE_COLORS[m.role]}`}>{m.role}</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">{new Date(m.joined_at).toLocaleDateString()}</td>
                {canManage && (
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => setRemoveTarget(m)} className="text-sm text-red-600 hover:underline">Remove</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Add project member</h2>
            {addError && <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">{addError}</div>}
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Role</label>
                <select value={newRole} onChange={(e) => setNewRole(e.target.value as ProjectMemberRole)}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none">
                  {PROJECT_MEMBER_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowAdd(false); setAddError(""); }}
                  className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={isAdding}
                  className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50">
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

function SettingsTab({ orgSlug, projectSlug, canManage }: { orgSlug: string; projectSlug: string; canManage: boolean }) {
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

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

  if (isLoading) return <p className="text-gray-500">Loading settings...</p>;
  if (!settings) return <p className="text-red-500">Failed to load settings.</p>;

  return (
    <div className="max-w-2xl">
      <form onSubmit={handleSave} className="space-y-6">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-medium text-gray-900">Project Settings</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Repository URL</label>
              <input type="url" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} disabled={!canManage}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-gray-100" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Default branch</label>
                <input type="text" value={defaultBranch} onChange={(e) => setDefaultBranch(e.target.value)} disabled={!canManage}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-gray-100" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Branch convention</label>
                <input type="text" value={branchConvention} onChange={(e) => setBranchConvention(e.target.value)} disabled={!canManage}
                  placeholder="{type}/{identifier}" className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-gray-100" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Required reviewers</label>
                <input type="number" min={0} value={reviewers} onChange={(e) => setReviewers(parseInt(e.target.value) || 0)} disabled={!canManage}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-gray-100" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Issue prefix override</label>
                <input type="text" maxLength={10} value={prefixOverride} onChange={(e) => setPrefixOverride(e.target.value)} disabled={!canManage}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-gray-100" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Estimation method</label>
              <select value={estimation} onChange={(e) => setEstimation(e.target.value as EstimationMethod)} disabled={!canManage}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-gray-100">
                {ESTIMATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="autoClose" checked={autoClose} onChange={(e) => setAutoClose(e.target.checked)} disabled={!canManage}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
              <label htmlFor="autoClose" className="text-sm text-gray-700">Auto-close completed issues</label>
            </div>
          </div>

          {canManage && (
            <div className="mt-6">
              {saveMessage && (
                <p className={`mb-3 text-sm ${saveMessage.includes("Failed") ? "text-red-600" : "text-green-600"}`}>{saveMessage}</p>
              )}
              <button type="submit" disabled={isSaving}
                className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50">
                {isSaving ? "Saving..." : "Save settings"}</button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
