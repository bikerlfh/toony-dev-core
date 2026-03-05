# Issue Detail Page & Inline Editing — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the issue detail modal with a full-page route and add inline editing of title/description for BACKLOG/TODO issues.

**Architecture:** Create new Next.js page route at `issues/[identifier]/page.tsx` that reuses the same layout as the current modal. Add backend validation in `issue_service.py` to reject title/description edits on non-BACKLOG/TODO issues. Add pencil-icon inline editing on the new page.

**Tech Stack:** Django 5 / DRF (backend validation), Next.js 15 / React 19 (new page + inline edit UI), Tailwind CSS v4

---

### Task 1: Backend — Add status validation for title/description edits

**Files:**
- Modify: `backend/projects/services/issue_service.py:40-42`
- Test: `backend/tests/test_issues.py`

**Step 1: Write the failing tests**

Add to `backend/tests/test_issues.py`, inside `TestIssueDetail`:

```python
def test_update_title_allowed_in_backlog(
    self, authenticated_client, organization, project, issue
):
    """Title edit is allowed when issue is in BACKLOG status."""
    issue.status = "BACKLOG"
    issue.save()
    url = issue_url(organization.slug, project.slug, issue.identifier)
    data = {"title": "New Title"}
    response = authenticated_client.put(url, data, format="json")
    assert response.status_code == status.HTTP_200_OK
    assert response.data["title"] == "New Title"

def test_update_title_allowed_in_todo(
    self, authenticated_client, organization, project, issue
):
    """Title edit is allowed when issue is in TODO status."""
    issue.status = "TODO"
    issue.save()
    url = issue_url(organization.slug, project.slug, issue.identifier)
    data = {"title": "New Title"}
    response = authenticated_client.put(url, data, format="json")
    assert response.status_code == status.HTTP_200_OK
    assert response.data["title"] == "New Title"

def test_update_title_rejected_in_progress(
    self, authenticated_client, organization, project, issue
):
    """Title edit is rejected when issue is IN_PROGRESS."""
    issue.status = "IN_PROGRESS"
    issue.save()
    url = issue_url(organization.slug, project.slug, issue.identifier)
    data = {"title": "Should Fail"}
    response = authenticated_client.put(url, data, format="json")
    assert response.status_code == status.HTTP_400_BAD_REQUEST

def test_update_description_rejected_in_done(
    self, authenticated_client, organization, project, issue
):
    """Description edit is rejected when issue is DONE."""
    issue.status = "DONE"
    issue.save()
    url = issue_url(organization.slug, project.slug, issue.identifier)
    data = {"description": "Should Fail"}
    response = authenticated_client.put(url, data, format="json")
    assert response.status_code == status.HTTP_400_BAD_REQUEST

def test_update_status_still_works_in_progress(
    self, authenticated_client, organization, project, issue
):
    """Non-title/description fields can still be updated in any status."""
    issue.status = "IN_PROGRESS"
    issue.save()
    url = issue_url(organization.slug, project.slug, issue.identifier)
    data = {"priority": "HIGH"}
    response = authenticated_client.put(url, data, format="json")
    assert response.status_code == status.HTTP_200_OK
    assert response.data["priority"] == "HIGH"
```

**Step 2: Run tests to verify they fail**

Run: `docker compose exec backend pytest tests/test_issues.py::TestIssueDetail::test_update_title_rejected_in_progress tests/test_issues.py::TestIssueDetail::test_update_description_rejected_in_done -v`
Expected: FAIL — both currently return 200 OK instead of 400

**Step 3: Implement the validation**

In `backend/projects/services/issue_service.py`, at the top of `update_issue()` (line 41, after `label_ids = kwargs.pop(...)`), add:

```python
from django.core.exceptions import ValidationError
from projects.models.issue import IssueStatus

# ... inside update_issue, after label_ids pop:
editable_statuses = {IssueStatus.BACKLOG, IssueStatus.TODO}
if ("title" in kwargs or "description" in kwargs) and issue.status not in editable_statuses:
    raise ValidationError(
        "Title and description can only be edited when the issue is in BACKLOG or TODO status."
    )
```

Note: The `ValidationError` from Django is already handled by DRF and returns 400. Verify in the view that it propagates correctly — check `backend/projects/views/issue_views.py` `IssueDetailView.put()`. If the service raises `ValidationError`, DRF's exception handler converts it to 400.

Actually, DRF does NOT auto-handle Django's `ValidationError`. Use DRF's `ValidationError` instead:

```python
from rest_framework.exceptions import ValidationError as DRFValidationError
```

Then raise:
```python
raise DRFValidationError(
    "Title and description can only be edited when the issue is in BACKLOG or TODO status."
)
```

**Step 4: Run all issue tests to verify they pass**

Run: `docker compose exec backend pytest tests/test_issues.py -v`
Expected: All tests PASS (including existing `test_update_issue` which uses default BACKLOG status from factory)

**Step 5: Commit**

```bash
git add backend/projects/services/issue_service.py backend/tests/test_issues.py
git commit -m "feat(issues): restrict title/description editing to BACKLOG and TODO statuses"
```

---

### Task 2: Frontend — Create the issue detail page

**Files:**
- Create: `frontend/app/(dashboard)/[orgSlug]/projects/[projectSlug]/issues/[identifier]/page.tsx`

This page reuses the same layout as `IssueDetailModal` but rendered as a full page (no overlay/backdrop). It fetches its own data (issue, members, milestones, cycles, labels) and manages its own WebSocket connection.

**Step 1: Create the page file**

```tsx
"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useOrg } from "@/contexts/org-context";
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
import { canManageIssues } from "@/lib/roles";
import { useProjectWebSocket } from "@/hooks/use-project-websocket";
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

// Pencil icon SVG for inline edit buttons
function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className || "h-3.5 w-3.5"} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.33 2a1.89 1.89 0 012.67 2.67L5.33 13.33 2 14l.67-3.33L11.33 2z" />
    </svg>
  );
}

export default function IssueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = params.orgSlug as string;
  const projectSlug = params.projectSlug as string;
  const identifier = params.identifier as string;
  const { currentMembership } = useOrg();

  const canManage = canManageIssues(currentMembership?.role);

  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [activeTab, setActiveTab] = useState<"comments" | "activity">("comments");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [latestWsEvent, setLatestWsEvent] = useState<ProjectWsEvent | null>(null);

  // Inline editing state
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [isSavingDescription, setIsSavingDescription] = useState(false);

  const isEditable = issue?.status === "BACKLOG" || issue?.status === "TODO";

  const fetchIssue = useCallback(async () => {
    try {
      const data = await getIssue(orgSlug, projectSlug, identifier);
      setIssue(data);
    } finally {
      setIsLoading(false);
    }
  }, [orgSlug, projectSlug, identifier]);

  const fetchMetadata = useCallback(async () => {
    const [m, ms, cs, ls] = await Promise.all([
      listProjectMembers(orgSlug, projectSlug),
      listMilestones(orgSlug, projectSlug),
      listCycles(orgSlug, projectSlug),
      listLabels(),
    ]);
    setMembers(m.results);
    setMilestones(ms.results);
    setCycles(cs.results);
    setLabels(ls.results);
  }, [orgSlug, projectSlug]);

  useEffect(() => {
    fetchIssue();
    fetchMetadata();
  }, [fetchIssue, fetchMetadata]);

  // WebSocket for real-time updates
  const handleWsEvent = useCallback(
    (event: ProjectWsEvent) => {
      if (event.type === "issue.updated" && event.data.identifier === identifier) {
        fetchIssue();
      } else if (event.type === "issue.deleted" && event.data.id === issue?.id) {
        router.push(`/${orgSlug}/projects/${projectSlug}`);
      } else if (
        event.type === "comment.created" ||
        event.type === "comment.updated" ||
        event.type === "comment.deleted"
      ) {
        setLatestWsEvent(event);
      }
    },
    [identifier, issue?.id, orgSlug, projectSlug, router, fetchIssue],
  );

  useProjectWebSocket({
    projectId: issue?.project_id ?? null,
    onEvent: handleWsEvent,
  });

  async function handleFieldUpdate(payload: Record<string, unknown>) {
    await updateIssue(orgSlug, projectSlug, identifier, payload);
    fetchIssue();
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await deleteIssue(orgSlug, projectSlug, identifier);
      router.push(`/${orgSlug}/projects/${projectSlug}`);
    } finally {
      setIsDeleting(false);
    }
  }

  // --- Inline edit handlers ---
  function startEditTitle() {
    if (!issue) return;
    setTitleDraft(issue.title);
    setEditingTitle(true);
  }

  async function saveTitle() {
    if (!issue || !titleDraft.trim() || titleDraft === issue.title) {
      setEditingTitle(false);
      return;
    }
    setIsSavingTitle(true);
    try {
      await updateIssue(orgSlug, projectSlug, identifier, { title: titleDraft });
      await fetchIssue();
      setEditingTitle(false);
    } catch {
      // Revert on error
      setTitleDraft(issue.title);
      setEditingTitle(false);
    } finally {
      setIsSavingTitle(false);
    }
  }

  function startEditDescription() {
    if (!issue) return;
    setDescriptionDraft(issue.description || "");
    setEditingDescription(true);
  }

  async function saveDescription() {
    if (!issue || descriptionDraft === (issue.description || "")) {
      setEditingDescription(false);
      return;
    }
    setIsSavingDescription(true);
    try {
      await updateIssue(orgSlug, projectSlug, identifier, { description: descriptionDraft });
      await fetchIssue();
      setEditingDescription(false);
    } catch {
      setDescriptionDraft(issue.description || "");
      setEditingDescription(false);
    } finally {
      setIsSavingDescription(false);
    }
  }

  if (isLoading) return <p className="text-slate-500">Loading issue...</p>;
  if (!issue) return <p className="text-red-400">Issue not found.</p>;

  return (
    <div>
      {/* Back link */}
      <button
        onClick={() => router.push(`/${orgSlug}/projects/${projectSlug}`)}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-300"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 12L6 8l4-4" />
        </svg>
        Back to project
      </button>

      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm text-slate-500">{identifier}</span>
        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ISSUE_STATUS_COLORS[issue.status]}`}>
          {ISSUE_STATUS_LABELS[issue.status]}
        </span>
        <PriorityBadge priority={issue.priority} />
      </div>

      {/* Main content + sidebar */}
      <div className="mt-4 flex gap-6">
        {/* Main content */}
        <div className="min-w-0 flex-1">
          {/* Title */}
          <div className="flex items-start gap-2">
            {editingTitle ? (
              <input
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveTitle();
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                onBlur={saveTitle}
                disabled={isSavingTitle}
                autoFocus
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xl font-medium text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
              />
            ) : (
              <>
                <h1 className="text-xl font-medium text-white">{issue.title}</h1>
                {canManage && isEditable && (
                  <button
                    onClick={startEditTitle}
                    className="mt-1 shrink-0 text-slate-600 transition-colors hover:text-indigo-400"
                    title="Edit title"
                  >
                    <PencilIcon />
                  </button>
                )}
              </>
            )}
          </div>

          {/* Description */}
          <div className="mt-3">
            {editingDescription ? (
              <textarea
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditingDescription(false);
                }}
                onBlur={saveDescription}
                disabled={isSavingDescription}
                autoFocus
                rows={4}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
              />
            ) : (
              <div className="flex items-start gap-2">
                {issue.description ? (
                  <p className="whitespace-pre-wrap text-sm text-slate-400">{issue.description}</p>
                ) : (
                  <p className="text-sm text-slate-600 italic">No description</p>
                )}
                {canManage && isEditable && (
                  <button
                    onClick={startEditDescription}
                    className="mt-0.5 shrink-0 text-slate-600 transition-colors hover:text-indigo-400"
                    title="Edit description"
                  >
                    <PencilIcon />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="mt-6 border-b border-slate-800/60">
            <nav className="-mb-px flex gap-4">
              {(["comments", "activity"] as const).map((tab) => (
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

          <div className="mt-4">
            {activeTab === "comments" && (
              <CommentsSection
                orgSlug={orgSlug}
                projectSlug={projectSlug}
                identifier={identifier}
                issueId={issue.id}
                wsEvent={latestWsEvent}
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
          message={`Permanently delete ${identifier}? This cannot be undone.`}
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

// --- Comments Section ---
// (Copy from issue-detail-modal.tsx CommentsSection — identical logic, same component)

function CommentsSection({
  orgSlug,
  projectSlug,
  identifier,
  issueId,
  wsEvent,
}: {
  orgSlug: string;
  projectSlug: string;
  identifier: string;
  issueId: string;
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
      setComments((await listComments(orgSlug, projectSlug, identifier)).results);
    } finally {
      setIsLoading(false);
    }
  }, [orgSlug, projectSlug, identifier]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  useEffect(() => {
    if (!wsEvent) return;
    if (wsEvent.type === "comment.created" && wsEvent.data.issue_id === issueId) {
      setComments((prev) => {
        if (prev.some((c) => c.id === wsEvent.data.comment.id)) return prev;
        return [...prev, wsEvent.data.comment];
      });
    } else if (wsEvent.type === "comment.updated" && wsEvent.data.issue_id === issueId) {
      setComments((prev) =>
        prev.map((c) => (c.id === wsEvent.data.comment.id ? wsEvent.data.comment : c)),
      );
    } else if (wsEvent.type === "comment.deleted" && wsEvent.data.issue_id === issueId) {
      setComments((prev) => prev.filter((c) => c.id !== wsEvent.data.comment_id));
    }
  }, [wsEvent, issueId]);

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

  async function handleDeleteComment() {
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

  if (isLoading) return <p className="text-sm text-slate-500">Loading comments...</p>;

  return (
    <div>
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
          onConfirm={handleDeleteComment}
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
        setActivities((await listActivities(orgSlug, projectSlug, identifier)).results);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [orgSlug, projectSlug, identifier]);

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
```

**Step 2: Verify the file compiles**

Run: `cd frontend && ./node_modules/.bin/next build` or check for TypeScript errors via IDE.

Note: The `IssueDetail` type must include `project_id`. Check `frontend/types/projects.ts` — if `project_id` is not on `IssueDetail`, use `issue.id` to derive the project from context. Looking at the existing modal, it doesn't use `project_id` for WebSocket — the parent `IssuesTab` passes `projectId` from the project. In the new page, we don't have the project ID directly. Two options:
- Add `project_id` to the issue detail response (if not there)
- Use a separate call to `getProject()` to get the project ID

Check the `IssueDetail` type first. If it doesn't have `project_id`, use a `getProject()` call in `fetchMetadata` to retrieve it and store it in state. The plan code above uses `issue?.project_id` — if the type doesn't have it, replace the WebSocket setup with fetching the project first.

**Step 3: Commit**

```bash
git add frontend/app/\(dashboard\)/\[orgSlug\]/projects/\[projectSlug\]/issues/\[identifier\]/page.tsx
git commit -m "feat(frontend): add full-page issue detail with inline title/description editing"
```

---

### Task 3: Frontend — Update IssuesTab to navigate instead of opening modal

**Files:**
- Modify: `frontend/app/(dashboard)/[orgSlug]/projects/[projectSlug]/page.tsx:1128-1309`

**Step 1: Modify the IssuesTab component**

In the `IssuesTab` function (starts at line 1132):

1. Add `useRouter` import at the top of the component:
```tsx
const router = useRouter();
```

Note: `useRouter` is already imported at the top of the file (line 4). No new import needed.

2. Remove these lines:
   - `const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);` (line 1142)
   - `const [latestWsEvent, setLatestWsEvent] = useState<ProjectWsEvent | null>(null);` (line 1143)
   - The entire `handleWsEvent` callback (lines 1145-1167)
   - `useProjectWebSocket({ projectId, onEvent: handleWsEvent });` (line 1169)
   - The comment event cases in handleWsEvent are no longer needed
   - Remove `projectId` from the component props since it was only used for WebSocket

3. Change the `onIssueClick` callbacks (lines 1265, 1271) from:
```tsx
onIssueClick={(issue) => setSelectedIssueId(issue.identifier)}
```
to:
```tsx
onIssueClick={(issue) => router.push(`/${orgSlug}/projects/${projectSlug}/issues/${issue.identifier}`)}
```

4. Remove the entire `IssueDetailModal` rendering block (lines 1292-1306):
```tsx
{/* Detail modal */}
{selectedIssueId && (
  <IssueDetailModal ... />
)}
```

5. Remove `IssueDetailModal` from the imports at the top of the file (line 40).

6. Remove `wsEvent` prop from `handleWsEvent` since we no longer need comment events here.

7. Keep the WebSocket for issue list updates (issue.created, issue.updated, issue.deleted) but move it back to the IssuesTab without the comment handling. Actually, looking at the code again — the `handleWsEvent` in `IssuesTab` handles both issue events AND passes comment events to the modal. Since the modal is gone, simplify the handler to only handle issue events:

```tsx
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
```

Keep `useProjectWebSocket` — it's still needed for live issue list updates.

8. Update the `IssuesTab` props to remove `projectId` (since WebSocket still needs it — actually check: the issue list still uses WebSocket for real-time issue updates, so `projectId` is still needed). Keep `projectId`.

9. Remove unused imports:
   - `IssueDetailModal` (line 40)
   - `ProjectWsEvent` from types import (line 59) — check if still used. It IS used in the `handleWsEvent` callback type. Keep it.

**Step 2: Also update IssuesTab call site**

At line 221, the `IssuesTab` is called with `projectId={project.id}`. Keep this since WebSocket is still used for issue list updates.

**Step 3: Verify no TypeScript errors**

Run: `cd frontend && npx tsc --noEmit` (or build).

**Step 4: Commit**

```bash
git add frontend/app/\(dashboard\)/\[orgSlug\]/projects/\[projectSlug\]/page.tsx
git commit -m "refactor(frontend): replace issue detail modal with full-page navigation"
```

---

### Task 4: Check IssueDetail type has project_id

**Files:**
- Check: `frontend/types/projects.ts` — `IssueDetail` type

**Step 1: Verify the type**

Read `frontend/types/projects.ts` and check if `IssueDetail` has a `project_id` field. If not, we need an alternative for the WebSocket `projectId` param.

If `IssueDetail` does NOT have `project_id`:
- Option A: Add `project_id` to the backend `IssueDetailSerializer` output (preferred)
- Option B: In the new page, call `getProject(orgSlug, projectSlug)` to get the project ID

Since the page already has `orgSlug` and `projectSlug` from params, Option B is simpler — fetch the project to get its ID for WebSocket. But actually, looking at the page code, we can get the project via `getProject()` which we already import from the projects API.

Updated approach for the page: fetch the project in `fetchMetadata`, store `projectId` in state, pass to `useProjectWebSocket`.

```tsx
const [projectId, setProjectId] = useState<string | null>(null);

// In fetchMetadata:
const fetchMetadata = useCallback(async () => {
  const [proj, m, ms, cs, ls] = await Promise.all([
    getProject(orgSlug, projectSlug),
    listProjectMembers(orgSlug, projectSlug),
    listMilestones(orgSlug, projectSlug),
    listCycles(orgSlug, projectSlug),
    listLabels(),
  ]);
  setProjectId(proj.id);
  setMembers(m.results);
  // ...
}, [orgSlug, projectSlug]);
```

This is a fallback. First check the type — if `project_id` exists on `IssueDetail`, use it directly.

**Step 2: Apply the fix if needed and commit**

```bash
git add <changed files>
git commit -m "fix(frontend): ensure project ID available for WebSocket in issue detail page"
```

---

### Task 5: Cleanup — Remove IssueDetailModal if no longer used

**Files:**
- Check: `frontend/components/issues/issue-detail-modal.tsx`

**Step 1: Verify no other imports**

Search the codebase for any remaining imports of `IssueDetailModal`. If the only consumer was the project detail page (which we removed in Task 3), delete the modal file entirely.

Run: `grep -r "IssueDetailModal" frontend/`

**Step 2: Delete if unused**

```bash
rm frontend/components/issues/issue-detail-modal.tsx
```

**Step 3: Commit**

```bash
git add -u frontend/components/issues/issue-detail-modal.tsx
git commit -m "chore(frontend): remove unused IssueDetailModal component"
```

---

### Task 6: Manual testing

**Step 1: Start the dev environment**

Run: `make up`

**Step 2: Test issue navigation**

1. Navigate to a project's Issues tab
2. Click on an issue in the Kanban board → should navigate to `/org/projects/proj/issues/PROJ-1`
3. Click on an issue in the list view → same navigation
4. On the issue page, verify:
   - Back button returns to project page
   - All properties sidebar fields work (status, priority, assignee, etc.)
   - Comments tab loads and allows creating/editing/deleting comments
   - Activity tab loads
   - Delete issue works and redirects back

**Step 3: Test inline editing**

1. Open an issue in BACKLOG or TODO status
2. Verify pencil icons appear next to title and description
3. Click pencil on title → input appears, edit, press Enter → saves
4. Click pencil on description → textarea appears, edit, click away → saves
5. Press Escape while editing → cancels edit

**Step 4: Test editing restrictions**

1. Change an issue status to IN_PROGRESS
2. Verify pencil icons disappear from title and description
3. Via API (curl/Postman), try to PUT title on an IN_PROGRESS issue → should get 400

**Step 5: Run backend tests**

Run: `docker compose exec backend pytest tests/test_issues.py -v`
Expected: All tests pass including the new status validation tests.
