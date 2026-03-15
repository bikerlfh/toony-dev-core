"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { WorkflowDetail } from "@/types";
import { resolveWorkflowForIssue } from "@/lib/api/workflows";

interface IssueResolvedWorkflowProps {
  issueId: string;
}

export function IssueResolvedWorkflow({ issueId }: IssueResolvedWorkflowProps) {
  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchWorkflow = useCallback(async () => {
    try {
      setWorkflow(await resolveWorkflowForIssue(issueId));
    } finally {
      setIsLoading(false);
    }
  }, [issueId]);

  useEffect(() => {
    fetchWorkflow();
  }, [fetchWorkflow]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-500" />
      </div>
    );
  }

  if (!workflow) return null;

  return (
    <div>
      <h3 className="mb-2 text-xs font-medium uppercase text-slate-500">
        Workflow
      </h3>
      <Link
        href={`/workflows/${workflow.id}/edit`}
        target="_blank"
        className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-800/60 bg-slate-900 px-3 py-2 transition-colors hover:border-slate-700/60"
      >
        <svg
          className="h-4 w-4 shrink-0 text-indigo-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z"
          />
        </svg>
        <span className="truncate text-xs text-slate-200">
          {workflow.name}
        </span>
      </Link>
    </div>
  );
}
