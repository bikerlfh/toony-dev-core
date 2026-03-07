"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getArtifact, updateGlobalArtifact } from "@/lib/api/artifacts";
import { ArtifactStatusBadge } from "@/components/artifact-status-badge";
import { ArtifactTypeBadge } from "@/components/artifact-type-badge";
import type { ArtifactDetail, ArtifactStatus } from "@/types/artifacts";

const STATUS_ACTIONS: Partial<Record<ArtifactStatus, { label: string; next: ArtifactStatus; variant: string }[]>> = {
  PENDING_APPROVAL: [
    { label: "Start Review", next: "IN_REVIEW", variant: "bg-blue-600 hover:bg-blue-500" },
    { label: "Approve", next: "APPROVED", variant: "bg-emerald-600 hover:bg-emerald-500" },
    { label: "Reject", next: "REJECTED", variant: "bg-red-600 hover:bg-red-500" },
  ],
  IN_REVIEW: [
    { label: "Approve", next: "APPROVED", variant: "bg-emerald-600 hover:bg-emerald-500" },
    { label: "Reject", next: "REJECTED", variant: "bg-red-600 hover:bg-red-500" },
    { label: "Request Revision", next: "REVISION_REQUESTED", variant: "bg-orange-600 hover:bg-orange-500" },
  ],
  DRAFT: [
    { label: "Submit for Approval", next: "PENDING_APPROVAL", variant: "bg-indigo-600 hover:bg-indigo-500" },
  ],
  REVISION_REQUESTED: [
    { label: "Resubmit", next: "PENDING_APPROVAL", variant: "bg-indigo-600 hover:bg-indigo-500" },
    { label: "Back to Draft", next: "DRAFT", variant: "bg-slate-600 hover:bg-slate-500" },
  ],
  REJECTED: [
    { label: "Back to Draft", next: "DRAFT", variant: "bg-slate-600 hover:bg-slate-500" },
  ],
};

export default function ArtifactDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [artifact, setArtifact] = useState<ArtifactDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchArtifact = useCallback(async () => {
    try {
      setArtifact(await getArtifact(params.id));
    } finally {
      setIsLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    fetchArtifact();
  }, [fetchArtifact]);

  async function handleStatusChange(newStatus: ArtifactStatus) {
    if (!artifact || isUpdating) return;
    setIsUpdating(true);
    try {
      const updated = await updateGlobalArtifact(artifact.id, { status: newStatus });
      setArtifact(updated);
    } finally {
      setIsUpdating(false);
    }
  }

  if (isLoading || !artifact) {
    return (
      <div className="flex h-96 items-center justify-center">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  const actions = STATUS_ACTIONS[artifact.status] || [];

  return (
    <div className="p-6">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="mb-4 text-sm text-slate-500 transition-colors hover:text-slate-300"
      >
        &larr; Back
      </button>

      <div className="flex gap-6">
        {/* Main content */}
        <div className="min-w-0 flex-1">
          {/* Header */}
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-medium text-white">{artifact.title}</h1>
            <ArtifactTypeBadge type={artifact.artifact_type} />
            <ArtifactStatusBadge status={artifact.status} />
          </div>

          {/* Actions */}
          {actions.length > 0 && (
            <div className="mt-4 flex gap-2">
              {actions.map((action) => (
                <button
                  key={action.next}
                  onClick={() => handleStatusChange(action.next)}
                  disabled={isUpdating}
                  className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 ${action.variant}`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}

          {/* Markdown content */}
          <div className="mt-6 rounded-xl border border-slate-800/60 bg-slate-900 p-6">
            <div className="prose prose-invert max-w-none text-sm text-slate-300 whitespace-pre-wrap">
              {artifact.content}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-72 shrink-0 rounded-xl border border-slate-800/60 bg-slate-950 p-4">
          <h3 className="mb-3 text-xs font-medium uppercase text-slate-500">Details</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-500">Issue</label>
              <p className="mt-1 text-sm text-indigo-400">
                {artifact.issue.identifier}: {artifact.issue.title}
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">Agent Task</label>
              <p className="mt-1 text-sm text-slate-300">{artifact.agent_task.title}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">Session ID</label>
              <p className="mt-1 truncate text-sm text-slate-400 font-mono">{artifact.session_id}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">Requires Approval</label>
              <p className="mt-1 text-sm text-slate-300">{artifact.requires_approval ? "Yes" : "No"}</p>
            </div>
            <div className="border-t border-slate-800/60 pt-3">
              <label className="block text-xs font-medium text-slate-500">Created</label>
              <p className="mt-1 text-sm text-slate-400">
                {new Date(artifact.created_at).toLocaleString()}
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">Updated</label>
              <p className="mt-1 text-sm text-slate-400">
                {new Date(artifact.updated_at).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
