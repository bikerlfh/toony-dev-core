"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { IssueDetail, ProjectPriority } from "@/types";
import { getIssue, updateIssue } from "@/lib/api/issues";
import { PriorityBadge } from "@/components/priority-badge";
import { IssueStatusBadge } from "@/components/issue-status-badge";
import { IssueAgentTasks } from "@/components/tasks/issue-agent-tasks";
import { IssueResolvedWorkflow } from "@/components/tasks/issue-resolved-workflow";
import FileAutoComplete from "@/components/ui/file-autocomplete";

interface IssueSidePanelProps {
  projectId: string;
  issueId: string;
  onClose: () => void;
  onUpdated?: () => void;
}

export function IssueSidePanel({ projectId, issueId, onClose, onUpdated }: IssueSidePanelProps) {
  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Inline editing — title
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [isSavingTitle, setIsSavingTitle] = useState(false);

  // Inline editing — description
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [isSavingDescription, setIsSavingDescription] = useState(false);

  const isEditable = issue?.status === "BACKLOG" || issue?.status === "TODO";

  const fetchIssue = useCallback(async () => {
    try {
      setIsLoading(true);
      setIssue(await getIssue(projectId, issueId));
    } finally {
      setIsLoading(false);
    }
  }, [projectId, issueId]);

  useEffect(() => {
    fetchIssue();
  }, [fetchIssue]);

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
      onUpdated?.();
      setEditingTitle(false);
    } catch {
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
      onUpdated?.();
      setEditingDescription(false);
    } catch {
      setDescriptionDraft(issue.description || "");
      setEditingDescription(false);
    } finally {
      setIsSavingDescription(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-[480px] bg-slate-950 border-l border-slate-800/60 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800/60 bg-slate-950 px-6 py-4">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-mono text-slate-500">
              {issue?.identifier}
            </span>
            {(issue?.milestone || issue?.cycle) && (
              <>
                <span className="text-slate-700 text-[10px]">/</span>
                {issue.milestone && (
                  <span className="text-[11px] font-mono text-slate-600 truncate max-w-[8rem]" title={issue.milestone.name}>{issue.milestone.name}</span>
                )}
                {issue.milestone && issue.cycle && (
                  <span className="text-slate-700 text-[10px]">/</span>
                )}
                {issue.cycle && (
                  <span className="text-[11px] font-mono text-slate-600 truncate max-w-[8rem]" title={issue.cycle.name}>{issue.cycle.name}</span>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/projects/${projectId}/issues/${issueId}`}
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              Open full page
            </Link>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-500" />
          </div>
        ) : issue ? (
          <div className="px-6 py-4 space-y-6">
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
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-lg font-semibold text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
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
              <h2
                onClick={isEditable ? startEditTitle : undefined}
                className={`text-lg font-semibold text-white ${
                  isEditable
                    ? "cursor-text rounded-lg px-3 py-2 -mx-3 -my-2 transition-colors hover:bg-slate-800/40"
                    : ""
                }`}
                title={isEditable ? "Click to edit title" : undefined}
              >
                {issue.title}
              </h2>
            )}

            {/* Status + Priority */}
            <div className="flex items-center gap-3">
              <IssueStatusBadge status={issue.status} />
              <PriorityBadge priority={issue.priority as ProjectPriority} />
            </div>

            {/* Description — click to edit */}
            {editingDescription ? (
              <div>
                <FileAutoComplete
                  projectId={projectId}
                  value={descriptionDraft}
                  onChange={setDescriptionDraft}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setEditingDescription(false);
                  }}
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
                onClick={isEditable ? startEditDescription : undefined}
                className={`${
                  isEditable
                    ? "cursor-text rounded-lg px-3 py-2 -mx-3 -my-2 transition-colors hover:bg-slate-800/40"
                    : ""
                }`}
                title={isEditable ? "Click to edit description" : undefined}
              >
                {issue.description ? (
                  <p className="whitespace-pre-wrap text-sm text-slate-400">{issue.description}</p>
                ) : (
                  <p className="text-sm italic text-slate-600">
                    {isEditable ? "Click to add a description..." : "No description"}
                  </p>
                )}
              </div>
            )}

            {/* Details grid */}
            <div className="space-y-3 text-sm">
              {issue.assignee && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Assignee</span>
                  <span className="text-slate-300">
                    {issue.assignee.first_name} {issue.assignee.last_name}
                  </span>
                </div>
              )}
              {issue.due_date && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Due date</span>
                  <span className="text-slate-300">{issue.due_date}</span>
                </div>
              )}
            </div>

            {/* Labels */}
            {issue.labels.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {issue.labels.map((label) => (
                  <span
                    key={label.id}
                    className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
                    style={{ backgroundColor: label.color }}
                  >
                    {label.name}
                  </span>
                ))}
              </div>
            )}

            {/* Resolved Workflow */}
            <IssueResolvedWorkflow issueId={issueId} />

            {/* Agent Tasks */}
            <IssueAgentTasks issueId={issueId} />
          </div>
        ) : (
          <div className="px-6 py-20 text-center text-sm text-slate-500">
            Issue not found
          </div>
        )}
      </div>
    </div>
  );
}
