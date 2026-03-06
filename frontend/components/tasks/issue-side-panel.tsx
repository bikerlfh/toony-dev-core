"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { IssueDetail, IssueStatus, ProjectPriority } from "@/types";
import { getIssue } from "@/lib/api/issues";
import { PriorityBadge } from "@/components/priority-badge";

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

interface IssueSidePanelProps {
  projectId: string;
  issueId: string;
  onClose: () => void;
}

export function IssueSidePanel({ projectId, issueId, onClose }: IssueSidePanelProps) {
  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-[480px] bg-slate-950 border-l border-slate-800/60 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800/60 bg-slate-950 px-6 py-4">
          <span className="text-sm font-mono text-slate-500">
            {issue?.identifier}
          </span>
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
            {/* Title */}
            <h2 className="text-lg font-semibold text-white">{issue.title}</h2>

            {/* Status + Priority */}
            <div className="flex items-center gap-3">
              <span
                className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ISSUE_STATUS_COLORS[issue.status]}`}
              >
                {ISSUE_STATUS_LABELS[issue.status]}
              </span>
              <PriorityBadge priority={issue.priority as ProjectPriority} />
            </div>

            {/* Description */}
            {issue.description && (
              <div className="text-sm text-slate-400 whitespace-pre-wrap">
                {issue.description}
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
              {issue.milestone && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Milestone</span>
                  <span className="text-slate-300">{issue.milestone.name}</span>
                </div>
              )}
              {issue.cycle && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Cycle</span>
                  <span className="text-slate-300">{issue.cycle.name}</span>
                </div>
              )}
              {issue.reporter && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Reporter</span>
                  <span className="text-slate-300">
                    {issue.reporter.first_name} {issue.reporter.last_name}
                  </span>
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
