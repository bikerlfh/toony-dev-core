"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useOrg } from "@/contexts/org-context";
import { listTeams, deleteTeam } from "@/lib/api/teams";
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
      const res = await listTeams(orgSlug);
      setTeams(res.results);
    } finally {
      setIsLoading(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteTeam(orgSlug, deleteTarget.slug);
      setDeleteTarget(null);
      fetchTeams();
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return <p className="text-gray-500">Loading teams...</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Teams</h1>
        {canManage && (
          <button
            onClick={() => setShowCreate(true)}
            className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
          >
            Create team
          </button>
        )}
      </div>

      {teams.length === 0 ? (
        <p className="mt-6 text-gray-500">No teams yet.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <div
              key={team.id}
              className="cursor-pointer rounded-lg border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
              onClick={() => router.push(`/${orgSlug}/teams/${team.slug}`)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{team.name}</h3>
                  <span className="mt-1 inline-block rounded bg-gray-100 px-2 py-0.5 text-xs font-mono text-gray-600">
                    {team.identifier}
                  </span>
                </div>
                {canManage && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(team);
                    }}
                    className="text-sm text-red-500 hover:text-red-700"
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
          orgSlug={orgSlug}
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
