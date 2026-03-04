"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useOrg } from "@/contexts/org-context";
import { canEditOrg } from "@/lib/roles";
import { listSubAgents, deleteSubAgent } from "@/lib/api/sub-agents";
import { ConfirmModal } from "@/components/confirm-modal";
import type { SubAgentList } from "@/types";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-800 text-slate-400",
  ACTIVE: "bg-green-900/50 text-green-400",
  INACTIVE: "bg-yellow-900/50 text-yellow-400",
  DEPRECATED: "bg-red-900/50 text-red-400",
};

const AGENT_TYPE_LABELS: Record<string, string> = {
  CODER: "Coder",
  REVIEWER: "Reviewer",
  TESTER: "Tester",
  PLANNER: "Planner",
  CUSTOM: "Custom",
};

export default function SubAgentsPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = params.orgSlug as string;
  const { currentMembership } = useOrg();

  const canManage = canEditOrg(currentMembership?.role);

  const [agents, setAgents] = useState<SubAgentList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<SubAgentList | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchAgents = useCallback(async () => {
    try {
      setAgents((await listSubAgents(orgSlug)).results);
    } finally {
      setIsLoading(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteSubAgent(deleteTarget.slug);
      setDeleteTarget(null);
      fetchAgents();
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium tracking-tight text-white">Sub-Agents</h1>
        {canManage && (
          <button
            onClick={() => router.push(`/${orgSlug}/subagents/new`)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            Add sub-agent
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="mt-4 text-slate-500">Loading sub-agents...</p>
      ) : agents.length === 0 ? (
        <p className="mt-4 text-slate-500">No sub-agents configured.</p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-800/60">
          <table className="min-w-full divide-y divide-slate-800/60">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Version</th>
                {canManage && (
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-slate-500">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {agents.map((agent) => (
                <tr key={agent.id} className="hover:bg-slate-900/60">
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-200">
                    <span className="flex items-center gap-2">
                      {agent.name}
                      {agent.is_external && (
                        <span className="inline-flex rounded-full bg-purple-900/50 px-2 py-0.5 text-xs font-medium text-purple-400">
                          External
                        </span>
                      )}
                      {!agent.organization && (
                        <span className="inline-flex rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-400">
                          Global
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-400">
                    {AGENT_TYPE_LABELS[agent.agent_type] || agent.agent_type}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[agent.status] || ""}`}>
                      {agent.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-400">
                    {agent.version}
                  </td>
                  {canManage && (
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      <button
                        onClick={() => router.push(`/${orgSlug}/subagents/${agent.slug}/edit`)}
                        className="text-indigo-400 transition-colors hover:text-indigo-300"
                      >
                        Edit
                      </button>
                      <button onClick={() => setDeleteTarget(agent)} className="ml-3 text-red-400 transition-colors hover:text-red-300">
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete sub-agent"
          message={`Delete sub-agent "${deleteTarget.name}"? This will also remove all skill assignments.`}
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
