"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
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
import { PriorityBadge } from "@/components/priority-badge";
import { ConfirmModal } from "@/components/confirm-modal";
import type {
  IssueDetail,
  IssueStatus,
  IssuePriority,
  IssueComment,
  IssueActivity,
  Milestone,
  Cycle,
  Label,
  ProjectMember,
} from "@/types";

const STATUS_OPTIONS: { value: IssueStatus; label: string }[] = [
  { value: "BACKLOG", label: "Backlog" },
  { value: "TODO", label: "Todo" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "IN_REVIEW", label: "In Review" },
  { value: "DONE", label: "Done" },
  { value: "CANCELED", label: "Canceled" },
];

const ISSUE_STATUS_COLORS: Record<IssueStatus, string> = {
  BACKLOG: "bg-gray-100 text-gray-800",
  TODO: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  IN_REVIEW: "bg-purple-100 text-purple-800",
  DONE: "bg-green-100 text-green-800",
  CANCELED: "bg-red-100 text-red-800",
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

interface IssueDetailModalProps {
  orgSlug: string;
  projectSlug: string;
  identifier: string;
  members: ProjectMember[];
  milestones: Milestone[];
  cycles: Cycle[];
  labels: Label[];
  onClose: () => void;
  onUpdated: () => void;
}

type DetailTab = "comments" | "activity";

export function IssueDetailModal({
  orgSlug,
  projectSlug,
  identifier,
  members,
  milestones,
  cycles,
  labels,
  onClose,
  onUpdated,
}: IssueDetailModalProps) {
  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DetailTab>("comments");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchIssue = useCallback(async () => {
    try {
      setIssue(await getIssue(orgSlug, projectSlug, identifier));
    } finally {
      setIsLoading(false);
    }
  }, [orgSlug, projectSlug, identifier]);

  useEffect(() => {
    fetchIssue();
  }, [fetchIssue]);

  async function handleFieldUpdate(payload: Record<string, unknown>) {
    await updateIssue(orgSlug, projectSlug, identifier, payload);
    fetchIssue();
    onUpdated();
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await deleteIssue(orgSlug, projectSlug, identifier);
      onUpdated();
      onClose();
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex h-[85vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-gray-500">{identifier}</span>
            {issue && (
              <>
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ISSUE_STATUS_COLORS[issue.status]}`}>
                  {ISSUE_STATUS_LABELS[issue.status]}
                </span>
                <PriorityBadge priority={issue.priority} />
              </>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {isLoading || !issue ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-gray-500">Loading issue...</p>
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* Main content */}
            <div className="flex flex-1 flex-col overflow-y-auto p-6">
              <h1 className="text-xl font-semibold text-gray-900">{issue.title}</h1>

              {issue.description && (
                <p className="mt-3 whitespace-pre-wrap text-sm text-gray-600">{issue.description}</p>
              )}

              {/* Tabs */}
              <div className="mt-6 border-b border-gray-200">
                <nav className="-mb-px flex gap-4">
                  {(["comments", "activity"] as DetailTab[]).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`border-b-2 pb-2 text-sm font-medium capitalize transition-colors ${
                        activeTab === tab
                          ? "border-indigo-600 text-indigo-600"
                          : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
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
                    orgSlug={orgSlug}
                    projectSlug={projectSlug}
                    identifier={identifier}
                  />
                )}
                {activeTab === "activity" && (
                  <ActivitySection
                    orgSlug={orgSlug}
                    projectSlug={projectSlug}
                    identifier={identifier}
                  />
                )}
              </div>
            </div>

            {/* Properties sidebar */}
            <div className="w-72 shrink-0 overflow-y-auto border-l border-gray-200 bg-gray-50 p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase text-gray-500">Properties</h3>
              <div className="space-y-3">
                {/* Status */}
                <div>
                  <label className="block text-xs font-medium text-gray-500">Status</label>
                  <select
                    value={issue.status}
                    onChange={(e) => handleFieldUpdate({ status: e.target.value })}
                    className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-xs font-medium text-gray-500">Priority</label>
                  <select
                    value={issue.priority}
                    onChange={(e) => handleFieldUpdate({ priority: e.target.value })}
                    className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  >
                    {PRIORITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {/* Assignee */}
                <div>
                  <label className="block text-xs font-medium text-gray-500">Assignee</label>
                  <select
                    value={issue.assignee?.id || ""}
                    onChange={(e) => handleFieldUpdate({ assignee_id: e.target.value || null })}
                    className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.user.id} value={m.user.id}>
                        {m.user.first_name} {m.user.last_name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Milestone */}
                {milestones.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500">Milestone</label>
                    <select
                      value={issue.milestone?.id || ""}
                      onChange={(e) => handleFieldUpdate({ milestone_id: e.target.value || null })}
                      className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="">None</option>
                      {milestones.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Cycle */}
                {cycles.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500">Cycle</label>
                    <select
                      value={issue.cycle?.id || ""}
                      onChange={(e) => handleFieldUpdate({ cycle_id: e.target.value || null })}
                      className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="">None</option>
                      {cycles.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Estimate */}
                <div>
                  <label className="block text-xs font-medium text-gray-500">Estimate</label>
                  <input
                    type="number"
                    min={0}
                    value={issue.estimate ?? ""}
                    onChange={(e) =>
                      handleFieldUpdate({ estimate: e.target.value ? parseInt(e.target.value) : null })
                    }
                    placeholder="Points"
                    className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                {/* Due date */}
                <div>
                  <label className="block text-xs font-medium text-gray-500">Due date</label>
                  <input
                    type="date"
                    value={issue.due_date || ""}
                    onChange={(e) => handleFieldUpdate({ due_date: e.target.value || null })}
                    className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                {/* Labels */}
                {labels.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500">Labels</label>
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
                                ? "border-gray-900 bg-gray-900 text-white"
                                : "border-gray-300 text-gray-700 hover:border-gray-400"
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
                  <label className="block text-xs font-medium text-gray-500">Reporter</label>
                  <p className="mt-1 text-sm text-gray-700">
                    {issue.reporter.first_name} {issue.reporter.last_name}
                  </p>
                </div>

                {/* Created / Updated */}
                <div>
                  <label className="block text-xs font-medium text-gray-500">Created</label>
                  <p className="mt-1 text-xs text-gray-500">
                    {new Date(issue.created_at).toLocaleString()}
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500">Updated</label>
                  <p className="mt-1 text-xs text-gray-500">
                    {new Date(issue.updated_at).toLocaleString()}
                  </p>
                </div>

                {/* Delete */}
                <div className="border-t border-gray-200 pt-3">
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Delete issue
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showDeleteConfirm && (
          <ConfirmModal
            title="Delete issue"
            message={`Permanently delete ${identifier}? This cannot be undone.`}
            confirmLabel="Delete"
            confirmVariant="danger"
            isLoading={isDeleting}
            onConfirm={handleDelete}
            onCancel={() => setShowDeleteConfirm(false)}
          />
        )}
      </div>
    </div>
  );
}

// --- Comments Section ---

function CommentsSection({
  orgSlug,
  projectSlug,
  identifier,
}: {
  orgSlug: string;
  projectSlug: string;
  identifier: string;
}) {
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newBody, setNewBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<IssueComment | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchComments = useCallback(async () => {
    try {
      setComments(await listComments(orgSlug, projectSlug, identifier));
    } finally {
      setIsLoading(false);
    }
  }, [orgSlug, projectSlug, identifier]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!newBody.trim()) return;
    setIsSubmitting(true);
    try {
      await createComment(orgSlug, projectSlug, identifier, { body: newBody });
      setNewBody("");
      fetchComments();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpdate(id: string) {
    if (!editBody.trim()) return;
    await updateComment(orgSlug, projectSlug, identifier, id, { body: editBody });
    setEditingId(null);
    setEditBody("");
    fetchComments();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteComment(orgSlug, projectSlug, identifier, deleteTarget.id);
      setDeleteTarget(null);
      fetchComments();
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) return <p className="text-sm text-gray-500">Loading comments...</p>;

  return (
    <div>
      {/* Comment list */}
      {comments.length === 0 ? (
        <p className="text-sm text-gray-400">No comments yet.</p>
      ) : (
        <div className="space-y-4">
          {comments.map((c) => (
            <div key={c.id} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-[10px] font-medium text-gray-600">
                    {c.author.first_name?.[0]}
                    {c.author.last_name?.[0]}
                  </div>
                  <span className="text-sm font-medium text-gray-900">
                    {c.author.first_name} {c.author.last_name}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(c.created_at).toLocaleString()}
                  </span>
                  {c.edited_at && (
                    <span className="text-xs text-gray-400">(edited)</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingId(c.id);
                      setEditBody(c.body);
                    }}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteTarget(c)}
                    className="text-xs text-red-500 hover:text-red-700"
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
                    className="block w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => handleUpdate(c.id)}
                      className="rounded bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-700"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{c.body}</p>
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
          className="block w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting || !newBody.trim()}
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
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
  orgSlug,
  projectSlug,
  identifier,
}: {
  orgSlug: string;
  projectSlug: string;
  identifier: string;
}) {
  const [activities, setActivities] = useState<IssueActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setActivities(await listActivities(orgSlug, projectSlug, identifier));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [orgSlug, projectSlug, identifier]);

  if (isLoading) return <p className="text-sm text-gray-500">Loading activity...</p>;

  if (activities.length === 0) {
    return <p className="text-sm text-gray-400">No activity yet.</p>;
  }

  return (
    <div className="space-y-3">
      {activities.map((a) => (
        <div key={a.id} className="flex gap-3">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[10px] font-medium text-gray-600">
            {a.user.first_name?.[0]}
            {a.user.last_name?.[0]}
          </div>
          <div className="text-sm">
            <span className="font-medium text-gray-900">
              {a.user.first_name} {a.user.last_name}
            </span>{" "}
            <ActivityDescription activity={a} />
            <p className="mt-0.5 text-xs text-gray-400">
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
    return <span className="text-gray-600">created this issue</span>;
  }

  if (activity.action === "UPDATED" && activity.field_changed) {
    const field = activity.field_changed.replace(/_/g, " ");
    return (
      <span className="text-gray-600">
        changed <span className="font-medium">{field}</span>
        {activity.old_value && (
          <>
            {" "}from <span className="rounded bg-gray-100 px-1 py-0.5 text-xs">{activity.old_value}</span>
          </>
        )}
        {activity.new_value && (
          <>
            {" "}to <span className="rounded bg-gray-100 px-1 py-0.5 text-xs">{activity.new_value}</span>
          </>
        )}
      </span>
    );
  }

  if (activity.action === "DELETED") {
    return <span className="text-gray-600">deleted this issue</span>;
  }

  return <span className="text-gray-600">{activity.action.toLowerCase()}</span>;
}
