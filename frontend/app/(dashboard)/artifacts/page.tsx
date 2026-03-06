"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listAllArtifacts } from "@/lib/api/artifacts";
import { ArtifactStatusBadge } from "@/components/artifact-status-badge";
import { ArtifactTypeBadge } from "@/components/artifact-type-badge";
import type { ArtifactList, ArtifactType, ArtifactStatus } from "@/types/artifacts";

type TypeFilter = ArtifactType | "ALL";
type StatusFilter = ArtifactStatus | "ALL";

export default function ArtifactsPage() {
  const router = useRouter();
  const [artifacts, setArtifacts] = useState<ArtifactList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const fetchArtifacts = useCallback(async () => {
    try {
      const filters: Record<string, string> = {};
      if (typeFilter !== "ALL") filters.artifact_type = typeFilter;
      if (statusFilter !== "ALL") filters.status = statusFilter;

      const res = await listAllArtifacts(
        Object.keys(filters).length > 0 ? (filters as any) : undefined
      );
      setArtifacts(res.results);
    } finally {
      setIsLoading(false);
    }
  }, [typeFilter, statusFilter]);

  useEffect(() => {
    setIsLoading(true);
    fetchArtifacts();
  }, [fetchArtifacts]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-white">Artifacts</h1>
      </div>

      {/* Filters */}
      <div className="mt-4 flex gap-3">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        >
          <option value="ALL">All Types</option>
          <option value="PLAN">Plan</option>
          <option value="DESIGN_DOC">Design Doc</option>
          <option value="TECHNICAL_SPEC">Technical Spec</option>
          <option value="TEST_PLAN">Test Plan</option>
          <option value="OTHER">Other</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        >
          <option value="ALL">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="PENDING_APPROVAL">Pending Approval</option>
          <option value="IN_REVIEW">In Review</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="REVISION_REQUESTED">Revision Requested</option>
          <option value="SUPERSEDED">Superseded</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="mt-4 text-slate-500">Loading...</p>
      ) : artifacts.length === 0 ? (
        <p className="mt-16 text-center text-slate-500">No artifacts found.</p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-800/60">
          <table className="min-w-full divide-y divide-slate-800/60">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {artifacts.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => router.push(`/artifacts/${a.id}`)}
                  className="cursor-pointer transition-colors hover:bg-slate-900/60"
                >
                  <td className="px-4 py-3 text-sm text-slate-200">{a.title}</td>
                  <td className="px-4 py-3">
                    <ArtifactTypeBadge type={a.artifact_type} />
                  </td>
                  <td className="px-4 py-3">
                    <ArtifactStatusBadge status={a.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {new Date(a.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
