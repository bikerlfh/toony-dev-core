"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useOrg } from "@/contexts/org-context";
import { listTeams, deleteTeam } from "@/lib/api/workspace";
import { canManageTeams } from "@/lib/roles";
import { CreateTeamModal } from "@/components/create-team-modal";
import { ConfirmModal } from "@/components/confirm-modal";
import type { Team } from "@/types";

export default function TeamsPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = params.orgSlug as string;
  const { currentMembership } = useOrg();

  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const canManage = canManageTeams(currentMembership?.role);

  const fetchTeams = useCallback(async () => {
    try {
      const res = await listTeams();
      setTeams(res.results);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteTeam(deleteTarget.slug);
      setDeleteTarget(null);
      fetchTeams();
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return <p className="text-slate-500">Loading teams...</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium tracking-tight text-white">Teams</h1>
        {canManage && (
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            Create team
          </button>
        )}
      </div>

      {teams.length === 0 ? (
        <p className="mt-6 text-slate-500">No teams yet.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <div
              key={team.id}
              className="cursor-pointer rounded-xl border border-slate-800/60 bg-slate-900 p-5 transition-colors hover:bg-slate-900/80"
              onClick={() => router.push(`/${orgSlug}/teams/${team.slug}`)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-white">{team.name}</h3>
                  <span className="mt-1 inline-block rounded-md bg-slate-800 px-2 py-0.5 text-xs font-mono text-slate-400">
                    {team.identifier}
                  </span>
                </div>
                {canManage && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(team);
                    }}
                    className="text-sm text-red-400 transition-colors hover:text-red-300"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateTeamModal
          onClose={() => setShowCreate(false)}
          onCreated={() => fetchTeams()}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete team"
          message={`Delete team "${deleteTarget.name}"? This action cannot be undone.`}
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
