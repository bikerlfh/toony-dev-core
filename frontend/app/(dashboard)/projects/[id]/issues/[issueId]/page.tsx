"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getIssue,
  updateIssue,
  deleteIssue,
  listComments,
  createComment,
  updateComment,
  deleteComment,
  listActivities,
} from "@/lib/api/issues";
import { listProjectMembers } from "@/lib/api/projects";
import { listMilestones } from "@/lib/api/milestones";
import { listCycles } from "@/lib/api/cycles";
import { listLabels } from "@/lib/api/workspace";
import { listIssueArtifacts } from "@/lib/api/artifacts";
import {
  listIssueDocuments,
  uploadIssueDocument,
  deleteIssueDocument,
} from "@/lib/api/issue-documents";
import type { IssueDocument } from "@/types/issue-documents";
import { ArtifactStatusBadge } from "@/components/artifact-status-badge";
import { ArtifactTypeBadge } from "@/components/artifact-type-badge";
import { useProjectWebSocket } from "@/hooks/use-project-websocket";
// Role checks removed — will be re-implemented when org context is rebuilt
import { PriorityBadge } from "@/components/priority-badge";
import { ConfirmModal } from "@/components/confirm-modal";
import { Select } from "@/components/ui/select";
import type {
  IssueDetail,
  IssueStatus,
  IssuePriority,
  IssueComment as IssueCommentType,
  IssueActivity,
  Milestone,
  Cycle,
  Label,
  ProjectMember,
  ProjectWsEvent,
} from "@/types";
import type { ArtifactList } from "@/types/artifacts";

const STATUS_OPTIONS: { value: IssueStatus; label: string }[] = [
  { value: "BACKLOG", label: "Backlog" },
  { value: "TODO", label: "Todo" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "IN_REVIEW", label: "In Review" },
  { value: "DONE", label: "Done" },
  { value: "CANCELED", label: "Canceled" },
];

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

const PRIORITY_OPTIONS: { value: IssuePriority; label: string }[] = [
  { value: "NONE", label: "None" },
  { value: "URGENT", label: "Urgent" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

type DetailTab = "comments" | "activity" | "artifacts";

export default function IssueDetailPage() {
  const params = useParams<{ id: string; issueId: string }>();
  const projectId = params.id;
  const issueId = params.issueId;
  const router = useRouter();

  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DetailTab>("comments");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Sidebar data
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);

  // WebSocket
  const [latestWsEvent, setLatestWsEvent] = useState<ProjectWsEvent | null>(null);

  // Inline editing — title
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [isSavingTitle, setIsSavingTitle] = useState(false);

  // Inline editing — description
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [isSavingDescription, setIsSavingDescription] = useState(false);

  // Role checks temporarily set to true — will be re-implemented when org context is rebuilt
  const canManage = true;
  const isEditable = issue?.status === "BACKLOG" || issue?.status === "TODO";

  const fetchIssue = useCallback(async () => {
    try {
      setIssue(await getIssue(projectId, issueId));
    } finally {
      setIsLoading(false);
    }
  }, [projectId, issueId]);

  // Load issue + sidebar data + project ID for WebSocket
  useEffect(() => {
    fetchIssue();
  }, [fetchIssue]);

  useEffect(() => {
    (async () => {
      try {
        const [membersRes, milestonesRes, cyclesRes, labelsRes] = await Promise.all([
          listProjectMembers(projectId),
          listMilestones(projectId),
          listCycles(projectId),
          listLabels(),
        ]);
        setMembers(membersRes.results);
        setMilestones(milestonesRes.results);
        setCycles(cyclesRes.results);
        setLabels(labelsRes.results);
      } catch {
        // sidebar data fetch failed — non-critical
      }
    })();
  }, [projectId]);

  // WebSocket handler
  const handleWsEvent = useCallback(
    (event: ProjectWsEvent) => {
      if (event.type === "issue.updated" && event.data.id === issueId) {
        fetchIssue();
      } else if (event.type === "issue.deleted" && event.data.id === issue?.id) {
        router.push(`/projects/${projectId}`);
      } else if (
        event.type === "comment.created" ||
        event.type === "comment.updated" ||
        event.type === "comment.deleted"
      ) {
        setLatestWsEvent(event);
      }
    },
    [issueId, issue?.id, projectId, router, fetchIssue],
  );

  useProjectWebSocket({ projectId, onEvent: handleWsEvent });

  // Field update helper
  async function handleFieldUpdate(payload: Record<string, unknown>) {
    await updateIssue(projectId, issueId, payload);
    fetchIssue();
  }

  // Delete
  async function handleDelete() {
    setIsDeleting(true);
    try {
      await deleteIssue(projectId, issueId);
      router.push(`/projects/${projectId}`);
    } finally {
      setIsDeleting(false);
    }
  }

  // Inline edit — title
  function startEditTitle() {
    if (!issue) return;
    setTitleDraft(issue.title);
    setEditingTitle(true);
  }

  async function saveTitle() {
    if (!issue || isSavingTitle) return;
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === issue.title) {
      setEditingTitle(false);
      return;
    }
    setIsSavingTitle(true);
    try {
      await updateIssue(projectId, issueId, { title: trimmed });
      await fetchIssue();
      setEditingTitle(false);
    } catch {
      // revert on error
      setTitleDraft(issue.title);
      setEditingTitle(false);
    } finally {
      setIsSavingTitle(false);
    }
  }

  // Inline edit — description
  function startEditDescription() {
    if (!issue) return;
    setDescriptionDraft(issue.description || "");
    setEditingDescription(true);
  }

  async function saveDescription() {
    if (!issue || isSavingDescription) return;
    const trimmed = descriptionDraft.trim();
    if (trimmed === (issue.description || "")) {
      setEditingDescription(false);
      return;
    }
    setIsSavingDescription(true);
    try {
      await updateIssue(projectId, issueId, { description: trimmed });
      await fetchIssue();
      setEditingDescription(false);
    } catch {
      // revert on error
      setDescriptionDraft(issue.description || "");
      setEditingDescription(false);
    } finally {
      setIsSavingDescription(false);
    }
  }

  if (isLoading || !issue) {
    return (
      <div className="flex h-96 items-center justify-center">
        <p className="text-slate-500">Loading issue...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Back link */}
      <button
        onClick={() => router.push(`/projects/${projectId}`)}
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 transition-colors hover:text-white"
      >
        &larr; Back to project
      </button>

      {/* Header: identifier + status badge + priority badge */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm text-slate-500">{issue.identifier}</span>
        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ISSUE_STATUS_COLORS[issue.status]}`}>
          {ISSUE_STATUS_LABELS[issue.status]}
        </span>
        <PriorityBadge priority={issue.priority} />
      </div>

      {/* Main content + sidebar in flex row */}
      <div className="mt-4 flex gap-6">
        {/* Left: main content */}
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
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xl font-medium text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={saveTitle}
                  disabled={isSavingTitle}
                  className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                >
                  {isSavingTitle ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => setEditingTitle(false)}
                  disabled={isSavingTitle}
                  className="rounded-lg border border-slate-700 px-3 py-1 text-xs font-medium text-slate-300 transition-colors hover:text-white"
                >
                  Cancel
                </button>
                <span className="text-[10px] text-slate-600">Enter to save · Esc to cancel</span>
              </div>
            </div>
          ) : (
            <h1
              onClick={canManage && isEditable ? startEditTitle : undefined}
              className={`text-xl font-medium text-white ${
                canManage && isEditable
                  ? "cursor-text rounded-lg px-3 py-2 -mx-3 -my-2 transition-colors hover:bg-slate-800/40"
                  : ""
              }`}
              title={canManage && isEditable ? "Click to edit title" : undefined}
            >
              {issue.title}
            </h1>
          )}

          {/* Description — click to edit */}
          <div className="mt-3">
            {editingDescription ? (
              <div>
                <textarea
                  value={descriptionDraft}
                  onChange={(e) => setDescriptionDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setEditingDescription(false);
                  }}
                  disabled={isSavingDescription}
                  autoFocus
                  rows={4}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={saveDescription}
                    disabled={isSavingDescription}
                    className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {isSavingDescription ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => setEditingDescription(false)}
                    disabled={isSavingDescription}
                    className="rounded-lg border border-slate-700 px-3 py-1 text-xs font-medium text-slate-300 transition-colors hover:text-white"
                  >
                    Cancel
                  </button>
                  <span className="text-[10px] text-slate-600">Esc to cancel</span>
                </div>
              </div>
            ) : (
              <div
                onClick={canManage && isEditable ? startEditDescription : undefined}
                className={`${
                  canManage && isEditable
                    ? "cursor-text rounded-lg px-3 py-2 -mx-3 -my-2 transition-colors hover:bg-slate-800/40"
                    : ""
                }`}
                title={canManage && isEditable ? "Click to edit description" : undefined}
              >
                {issue.description ? (
                  <p className="whitespace-pre-wrap text-sm text-slate-400">{issue.description}</p>
                ) : (
                  <p className="text-sm italic text-slate-600">
                    {canManage && isEditable ? "Click to add a description..." : "No description"}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Attachments — always visible */}
          <AttachmentsSection projectId={projectId} issueId={issueId} />

          {/* Tabs */}
          <div className="mt-6 border-b border-slate-800/60">
            <nav className="-mb-px flex gap-4">
              {(["comments", "activity", "artifacts"] as DetailTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`border-b-2 pb-2 text-sm font-medium capitalize transition-colors ${
                    activeTab === tab
                      ? "border-indigo-500 text-indigo-400"
                      : "border-transparent text-slate-500 hover:border-slate-700 hover:text-slate-300"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </nav>
          </div>

          <div className="mt-4 flex-1">
            {activeTab === "comments" && (
              <CommentsSection
                projectId={projectId}
                issueId={issueId}
                issueUuid={issue.id}
                wsEvent={latestWsEvent}
              />
            )}
            {activeTab === "activity" && (
              <ActivitySection
                projectId={projectId}
                issueId={issueId}
              />
            )}
            {activeTab === "artifacts" && (
              <ArtifactsSection projectId={projectId} issueId={issueId} />
            )}
          </div>
        </div>

        {/* Properties sidebar */}
        <div className="w-72 shrink-0 rounded-xl border border-slate-800/60 bg-slate-950 p-4">
          <h3 className="mb-3 text-xs font-medium uppercase text-slate-500">Properties</h3>
          <div className="space-y-3">
            {/* Status */}
            <div>
              <label className="block text-xs font-medium text-slate-500">Status</label>
              <Select options={STATUS_OPTIONS} value={issue.status} onChange={(v) => handleFieldUpdate({ status: v })} className="mt-1" />
            </div>

            {/* Priority */}
            <div>
              <label className="block text-xs font-medium text-slate-500">Priority</label>
              <Select options={PRIORITY_OPTIONS} value={issue.priority} onChange={(v) => handleFieldUpdate({ priority: v })} className="mt-1" />
            </div>

            {/* Assignee */}
            <div>
              <label className="block text-xs font-medium text-slate-500">Assignee</label>
              <Select
                options={[{ value: "", label: "Unassigned" }, ...members.map((m) => ({ value: m.user.id, label: `${m.user.first_name} ${m.user.last_name}` }))]}
                value={issue.assignee?.id || ""}
                onChange={(v) => handleFieldUpdate({ assignee_id: v || null })}
                placeholder="Unassigned"
                className="mt-1"
              />
            </div>

            {/* Milestone */}
            {milestones.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-500">Milestone</label>
                <Select
                  options={[{ value: "", label: "None" }, ...milestones.map((m) => ({ value: m.id, label: m.name }))]}
                  value={issue.milestone?.id || ""}
                  onChange={(v) => handleFieldUpdate({ milestone_id: v || null })}
                  placeholder="None"
                  className="mt-1"
                />
              </div>
            )}

            {/* Cycle */}
            {cycles.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-500">Cycle</label>
                <Select
                  options={[{ value: "", label: "None" }, ...cycles.map((c) => ({ value: c.id, label: c.name }))]}
                  value={issue.cycle?.id || ""}
                  onChange={(v) => handleFieldUpdate({ cycle_id: v || null })}
                  placeholder="None"
                  className="mt-1"
                />
              </div>
            )}

            {/* Estimate */}
            <div>
              <label className="block text-xs font-medium text-slate-500">Estimate</label>
              <input
                type="number"
                min={0}
                value={issue.estimate ?? ""}
                onChange={(e) =>
                  handleFieldUpdate({ estimate: e.target.value ? parseInt(e.target.value) : null })
                }
                placeholder="Points"
                className="mt-1 block w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
              />
            </div>

            {/* Due date */}
            <div>
              <label className="block text-xs font-medium text-slate-500">Due date</label>
              <input
                type="date"
                value={issue.due_date || ""}
                onChange={(e) => handleFieldUpdate({ due_date: e.target.value || null })}
                className="mt-1 block w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
              />
            </div>

            {/* Labels */}
            {labels.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-500">Labels</label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {labels.map((l) => {
                    const selected = issue.labels.some((il) => il.id === l.id);
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => {
                          const newIds = selected
                            ? issue.labels.filter((il) => il.id !== l.id).map((il) => il.id)
                            : [...issue.labels.map((il) => il.id), l.id];
                          handleFieldUpdate({ label_ids: newIds });
                        }}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                          selected
                            ? "border-indigo-500 bg-indigo-600 text-white"
                            : "border-slate-700 text-slate-400 hover:border-slate-600"
                        }`}
                      >
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: l.color }}
                        />
                        {l.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Reporter */}
            <div>
              <label className="block text-xs font-medium text-slate-500">Reporter</label>
              <p className="mt-1 text-sm text-slate-300">
                {issue.reporter.first_name} {issue.reporter.last_name}
              </p>
            </div>

            {/* Created / Updated */}
            <div>
              <label className="block text-xs font-medium text-slate-500">Created</label>
              <p className="mt-1 text-xs text-slate-500">
                {new Date(issue.created_at).toLocaleString()}
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">Updated</label>
              <p className="mt-1 text-xs text-slate-500">
                {new Date(issue.updated_at).toLocaleString()}
              </p>
            </div>

            {/* Delete */}
            <div className="border-t border-slate-800/60 pt-3">
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="text-sm text-red-400 transition-colors hover:text-red-300"
              >
                Delete issue
              </button>
            </div>
          </div>
        </div>
      </div>

      {showDeleteConfirm && (
        <ConfirmModal
          title="Delete issue"
          message={`Permanently delete ${issue.identifier}? This cannot be undone.`}
          confirmLabel="Delete"
          confirmVariant="danger"
          isLoading={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}

// --- Attachments Section ---

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

const FILE_TYPE_ICONS: Record<string, string> = {
  "application/pdf": "PDF",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.ms-excel": "XLS",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "text/csv": "CSV",
  "text/plain": "TXT",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentsSection({
  projectId,
  issueId,
}: {
  projectId: string;
  issueId: string;
}) {
  const [documents, setDocuments] = useState<IssueDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploading, setUploading] = useState<Map<string, number>>(new Map());
  const [isDragging, setIsDragging] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IssueDocument | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await listIssueDocuments(projectId, issueId);
      setDocuments(res.results);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, issueId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const images = documents.filter((d) => IMAGE_TYPES.has(d.content_type));

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
  const backendOrigin = apiBase.replace(/\/api\/?$/, "");
  const resolveUrl = (url: string) =>
    url.startsWith("http") ? url : `${backendOrigin}${url}`;

  async function handleFiles(fileList: FileList | File[]) {
    const arr = Array.from(fileList);
    for (const file of arr) {
      const tempId = `${file.name}-${Date.now()}`;
      setUploading((prev) => new Map(prev).set(tempId, 0));
      try {
        await uploadIssueDocument(projectId, issueId, file, (percent) => {
          setUploading((prev) => new Map(prev).set(tempId, percent));
        });
        await fetchDocuments();
      } catch {
        // upload failed
      } finally {
        setUploading((prev) => {
          const next = new Map(prev);
          next.delete(tempId);
          return next;
        });
      }
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteIssueDocument(projectId, issueId, deleteTarget.id);
      setDeleteTarget(null);
      fetchDocuments();
    } finally {
      setIsDeleting(false);
    }
  }

  const hasContent = documents.length > 0 || uploading.size > 0;

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wider text-slate-500">
          Attachments
        </h3>
        {documents.length > 0 && (
          <span className="text-xs text-slate-600">
            {documents.length} file{documents.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Drop zone — compact when content exists */}
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed transition-colors ${
          isDragging
            ? "border-indigo-500 bg-indigo-500/10 text-indigo-400"
            : "border-slate-800 text-slate-600 hover:border-slate-700 hover:text-slate-500"
        } ${hasContent ? "p-2.5" : "p-6"}`}
      >
        <span className="text-xs">
          {hasContent
            ? "Drop files or click to add more"
            : "Drop files here or click to upload"}
        </span>
        <input
          type="file"
          multiple
          className="hidden"
          accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFiles(e.target.files);
              e.target.value = "";
            }
          }}
        />
      </label>

      {/* Upload progress */}
      {uploading.size > 0 && (
        <div className="mt-3 space-y-1.5">
          {Array.from(uploading.entries()).map(([id, percent]) => (
            <div
              key={id}
              className="flex items-center gap-3 rounded-lg border border-slate-800/60 bg-slate-900 px-3 py-2"
            >
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="text-xs tabular-nums text-slate-500">
                {percent}%
              </span>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="mt-3 flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-1 w-6 rounded-full bg-slate-700 animate-pulse"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      ) : documents.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {documents.map((doc) => {
            const isImage = IMAGE_TYPES.has(doc.content_type);
            const typeLabel =
              FILE_TYPE_ICONS[doc.content_type] ||
              doc.content_type.split("/")[1]?.toUpperCase() ||
              "FILE";

            return (
              <div
                key={doc.id}
                className="group relative h-24 w-24 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-slate-800/60 bg-slate-900 transition-colors hover:border-slate-700/60"
                onClick={() => {
                  if (isImage) {
                    setLightboxIndex(images.indexOf(doc));
                  } else {
                    window.open(resolveUrl(doc.file), "_blank");
                  }
                }}
              >
                {/* Content: thumbnail or type badge */}
                {isImage ? (
                  <img
                    src={resolveUrl(doc.file)}
                    alt={doc.original_filename}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <span className="text-xs font-bold text-slate-500">
                      {typeLabel}
                    </span>
                  </div>
                )}

                {/* Hover overlay — filename + size */}
                <div className="absolute inset-0 flex flex-col justify-end bg-black/0 transition-colors group-hover:bg-black/60">
                  <div className="p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <p className="truncate text-[10px] font-medium text-white">
                      {doc.original_filename}
                    </p>
                    <p className="text-[9px] text-slate-400">
                      {formatFileSize(doc.file_size)}
                    </p>
                  </div>
                </div>

                {/* Delete button on hover */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(doc);
                  }}
                  className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded bg-black/60 text-red-400 opacity-0 transition-opacity hover:text-red-300 group-hover:opacity-100"
                >
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Image lightbox */}
      {lightboxIndex !== null && (
        <ImageLightbox
          images={images}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          onDelete={(doc) => {
            setLightboxIndex(null);
            setDeleteTarget(doc);
          }}
          resolveUrl={resolveUrl}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Remove attachment"
          message={`Remove "${deleteTarget.original_filename}"? This cannot be undone.`}
          confirmLabel="Remove"
          confirmVariant="danger"
          isLoading={isDeleting}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// --- Image Lightbox ---

function ImageLightbox({
  images,
  currentIndex,
  onClose,
  onNavigate,
  onDelete,
  resolveUrl,
}: {
  images: IssueDocument[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onDelete: (doc: IssueDocument) => void;
  resolveUrl: (url: string) => string;
}) {
  const doc = images[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onNavigate(currentIndex - 1);
      if (e.key === "ArrowRight" && hasNext) onNavigate(currentIndex + 1);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, onNavigate, currentIndex, hasPrev, hasNext]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90"
      onClick={onClose}
    >
      {/* Top bar */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between border-b border-slate-800/40 px-6 py-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">
            {doc.original_filename}
          </p>
          <p className="text-xs text-slate-500">
            {formatFileSize(doc.file_size)}
            {images.length > 1 && (
              <>
                {" "}&middot; {currentIndex + 1} of {images.length}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <a
            href={resolveUrl(doc.file)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            title="Open in new tab"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 3H3v10h10v-3M9 3h4v4M14 2L7 9" />
            </svg>
          </a>
          <button
            onClick={() => onDelete(doc)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-red-500/20 hover:text-red-400"
            title="Delete"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4M12.667 4v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            title="Close (Esc)"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      </div>

      {/* Image */}
      <div
        className="flex max-h-[calc(100vh-8rem)] max-w-[calc(100vw-8rem)] items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={resolveUrl(doc.file)}
          alt={doc.original_filename}
          className="max-h-full max-w-full rounded-lg object-contain"
        />
      </div>

      {/* Navigation arrows */}
      {hasPrev && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(currentIndex - 1);
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800/60 bg-slate-900/80 text-slate-400 transition-colors hover:border-slate-700 hover:text-white"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 12L6 8l4-4" />
          </svg>
        </button>
      )}
      {hasNext && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(currentIndex + 1);
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800/60 bg-slate-900/80 text-slate-400 transition-colors hover:border-slate-700 hover:text-white"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 12l4-4-4-4" />
          </svg>
        </button>
      )}
    </div>
  );
}

// --- Artifacts Section ---

function ArtifactsSection({ projectId, issueId }: { projectId: string; issueId: string }) {
  const router = useRouter();
  const [artifacts, setArtifacts] = useState<ArtifactList[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await listIssueArtifacts(projectId, issueId);
        setArtifacts(res.results);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [projectId, issueId]);

  if (isLoading) return <p className="text-sm text-slate-500">Loading artifacts...</p>;
  if (artifacts.length === 0) return <p className="text-sm text-slate-500">No artifacts yet.</p>;

  return (
    <div className="space-y-3">
      {artifacts.map((a) => (
        <div
          key={a.id}
          onClick={() => router.push(`/artifacts/${a.id}`)}
          className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-800/60 bg-slate-900 p-3 transition-colors hover:border-slate-700/60"
        >
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-200">{a.title}</span>
            <ArtifactTypeBadge type={a.artifact_type} />
          </div>
          <ArtifactStatusBadge status={a.status} />
        </div>
      ))}
    </div>
  );
}

// --- Comments Section ---

function CommentsSection({
  projectId,
  issueId,
  issueUuid,
  wsEvent,
}: {
  projectId: string;
  issueId: string;
  issueUuid: string;
  wsEvent?: ProjectWsEvent | null;
}) {
  const [comments, setComments] = useState<IssueCommentType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newBody, setNewBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<IssueCommentType | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchComments = useCallback(async () => {
    try {
      setComments((await listComments(projectId, issueId)).results);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, issueId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Handle real-time comment events from WebSocket
  useEffect(() => {
    if (!wsEvent) return;
    if (wsEvent.type === "comment.created" && wsEvent.data.issue_id === issueUuid) {
      setComments((prev) => {
        if (prev.some((c) => c.id === wsEvent.data.comment.id)) return prev;
        return [...prev, wsEvent.data.comment];
      });
    } else if (wsEvent.type === "comment.updated" && wsEvent.data.issue_id === issueUuid) {
      setComments((prev) =>
        prev.map((c) => (c.id === wsEvent.data.comment.id ? wsEvent.data.comment : c)),
      );
    } else if (wsEvent.type === "comment.deleted" && wsEvent.data.issue_id === issueUuid) {
      setComments((prev) => prev.filter((c) => c.id !== wsEvent.data.comment_id));
    }
  }, [wsEvent, issueUuid]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!newBody.trim()) return;
    setIsSubmitting(true);
    try {
      await createComment(projectId, issueId, { body: newBody });
      setNewBody("");
      fetchComments();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpdate(id: string) {
    if (!editBody.trim()) return;
    await updateComment(projectId, issueId, id, { body: editBody });
    setEditingId(null);
    setEditBody("");
    fetchComments();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteComment(projectId, issueId, deleteTarget.id);
      setDeleteTarget(null);
      fetchComments();
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) return <p className="text-sm text-slate-500">Loading comments...</p>;

  return (
    <div>
      {/* Comment list */}
      {comments.length === 0 ? (
        <p className="text-sm text-slate-500">No comments yet.</p>
      ) : (
        <div className="space-y-4">
          {comments.map((c) => (
            <div key={c.id} className="rounded-xl border border-slate-800/60 bg-slate-900 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-[10px] font-medium text-slate-400">
                    {c.author.first_name?.[0]}
                    {c.author.last_name?.[0]}
                  </div>
                  <span className="text-sm font-medium text-slate-200">
                    {c.author.first_name} {c.author.last_name}
                  </span>
                  <span className="text-xs text-slate-500">
                    {new Date(c.created_at).toLocaleString()}
                  </span>
                  {c.edited_at && (
                    <span className="text-xs text-slate-500">(edited)</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingId(c.id);
                      setEditBody(c.body);
                    }}
                    className="text-xs text-slate-500 hover:text-slate-300"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteTarget(c)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {editingId === c.id ? (
                <div className="mt-2">
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={2}
                    className="block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => handleUpdate(c.id)}
                      className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-indigo-500"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 transition-colors hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{c.body}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* New comment form */}
      <form onSubmit={handleCreate} className="mt-4">
        <textarea
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          rows={3}
          placeholder="Write a comment..."
          className="block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting || !newBody.trim()}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {isSubmitting ? "Posting..." : "Comment"}
          </button>
        </div>
      </form>

      {deleteTarget && (
        <ConfirmModal
          title="Delete comment"
          message="Delete this comment? This cannot be undone."
          confirmLabel="Delete"
          confirmVariant="danger"
          isLoading={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// --- Activity Section ---

function ActivitySection({
  projectId,
  issueId,
}: {
  projectId: string;
  issueId: string;
}) {
  const [activities, setActivities] = useState<IssueActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setActivities((await listActivities(projectId, issueId)).results);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [projectId, issueId]);

  if (isLoading) return <p className="text-sm text-slate-500">Loading activity...</p>;

  if (activities.length === 0) {
    return <p className="text-sm text-slate-500">No activity yet.</p>;
  }

  return (
    <div className="space-y-3">
      {activities.map((a) => (
        <div key={a.id} className="flex gap-3">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-medium text-slate-400">
            {a.user.first_name?.[0]}
            {a.user.last_name?.[0]}
          </div>
          <div className="text-sm">
            <span className="font-medium text-slate-200">
              {a.user.first_name} {a.user.last_name}
            </span>{" "}
            <ActivityDescription activity={a} />
            <p className="mt-0.5 text-xs text-slate-500">
              {new Date(a.created_at).toLocaleString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityDescription({ activity }: { activity: IssueActivity }) {
  if (activity.action === "CREATED") {
    return <span className="text-slate-400">created this issue</span>;
  }

  if (activity.action === "UPDATED" && activity.field_changed) {
    const field = activity.field_changed.replace(/_/g, " ");
    return (
      <span className="text-slate-400">
        changed <span className="font-medium">{field}</span>
        {activity.old_value && (
          <>
            {" "}from <span className="rounded bg-slate-800 px-1 py-0.5 text-xs text-slate-300">{activity.old_value}</span>
          </>
        )}
        {activity.new_value && (
          <>
            {" "}to <span className="rounded bg-slate-800 px-1 py-0.5 text-xs text-slate-300">{activity.new_value}</span>
          </>
        )}
      </span>
    );
  }

  if (activity.action === "DELETED") {
    return <span className="text-slate-400">deleted this issue</span>;
  }

  return <span className="text-slate-400">{activity.action.toLowerCase()}</span>;
}
