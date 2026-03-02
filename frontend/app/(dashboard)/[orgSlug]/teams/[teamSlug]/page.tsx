"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useOrg } from "@/contexts/org-context";
import {
  getTeam,
  updateTeam,
  deleteTeam,
  listTeamMembers,
  addTeamMember,
  updateTeamMemberRole,
  removeTeamMember,
} from "@/lib/api/teams";
import { canManageTeams } from "@/lib/roles";
import { ConfirmModal } from "@/components/confirm-modal";
import { Select } from "@/components/ui/select";
import type { TeamDetail, TeamMember, TeamRole } from "@/types";

const TEAM_ROLES: { value: TeamRole; label: string }[] = [
  { value: "LEAD", label: "Lead" },
  { value: "MEMBER", label: "Member" },
];

const ROLE_BADGE_COLORS: Record<TeamRole, string> = {
  LEAD: "bg-purple-500/20 text-purple-400",
  MEMBER: "bg-slate-800 text-slate-400",
};

export default function TeamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = params.orgSlug as string;
  const teamSlug = params.teamSlug as string;
  const { currentMembership } = useOrg();

  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Add member state
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<TeamRole>("MEMBER");
  const [addError, setAddError] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  // Delete/remove state
  const [showDeleteTeam, setShowDeleteTeam] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const canManage = canManageTeams(currentMembership?.role);

  const fetchTeam = useCallback(async () => {
    try {
      const [teamData, memberData] = await Promise.all([
        getTeam(orgSlug, teamSlug),
        listTeamMembers(orgSlug, teamSlug),
      ]);
      setTeam(teamData);
      setMembers(memberData.results);
      setEditName(teamData.name);
      setEditDescription(teamData.description);
    } finally {
      setIsLoading(false);
    }
  }, [orgSlug, teamSlug]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    try {
      const updated = await updateTeam(orgSlug, teamSlug, {
        name: editName,
        description: editDescription,
      });
      setTeam(updated);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddMember(e: FormEvent) {
    e.preventDefault();
    setAddError("");
    setIsAdding(true);
    try {
      await addTeamMember(orgSlug, teamSlug, {
        email: newMemberEmail,
        role: newMemberRole,
      });
      setShowAddMember(false);
      setNewMemberEmail("");
      setNewMemberRole("MEMBER");
      fetchTeam();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })
        ?.response?.data;
      if (data) {
        setAddError(Object.values(data).flat().join(" "));
      } else {
        setAddError("Failed to add member.");
      }
    } finally {
      setIsAdding(false);
    }
  }

  async function handleChangeRole(member: TeamMember, newRole: TeamRole) {
    await updateTeamMemberRole(orgSlug, teamSlug, member.user.id, { role: newRole });
    fetchTeam();
  }

  async function handleRemoveMember() {
    if (!removeTarget) return;
    setIsRemoving(true);
    try {
      await removeTeamMember(orgSlug, teamSlug, removeTarget.user.id);
      setRemoveTarget(null);
      fetchTeam();
    } finally {
      setIsRemoving(false);
    }
  }

  async function handleDeleteTeam() {
    setIsDeleting(true);
    try {
      await deleteTeam(orgSlug, teamSlug);
      router.push(`/${orgSlug}/teams`);
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return <p className="text-slate-500">Loading team...</p>;
  }

  if (!team) {
    return <p className="text-red-500">Team not found.</p>;
  }

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium tracking-tight text-white">{team.name}</h1>
          <span className="mt-1 inline-block rounded bg-slate-800 px-2 py-0.5 text-xs font-mono text-slate-400">
            {team.identifier}
          </span>
        </div>
        {canManage && !isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white"
          >
            Edit
          </button>
        )}
      </div>

      {/* Edit form */}
      {isEditing && canManage && (
        <form onSubmit={handleSaveEdit} className="mt-4 rounded-xl border border-slate-800/60 bg-slate-900 p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400">Name</label>
            <input
              type="text"
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400">Description</label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={2}
              className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Description */}
      {!isEditing && team.description && (
        <p className="mt-3 text-sm text-slate-400">{team.description}</p>
      )}

      {/* Members */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-white">Members</h2>
          {canManage && (
            <button
              onClick={() => setShowAddMember(true)}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
            >
              Add member
            </button>
          )}
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-800/60 bg-slate-900">
          <table className="min-w-full divide-y divide-slate-800/60">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Member</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Joined</th>
                {canManage && (
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase text-slate-500">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {members.map((member) => (
                <tr key={member.id} className="hover:bg-slate-900/60">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-sm font-medium text-slate-400">
                        {member.user.first_name?.[0]}{member.user.last_name?.[0]}
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-slate-200">
                          {member.user.first_name} {member.user.last_name}
                        </p>
                        <p className="text-sm text-slate-500">{member.user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {canManage ? (
                      <Select
                        options={TEAM_ROLES}
                        value={member.role}
                        onChange={(v) => handleChangeRole(member, v as TeamRole)}
                        size="sm"
                      />
                    ) : (
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_BADGE_COLORS[member.role]}`}>
                        {member.role}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {new Date(member.joined_at).toLocaleDateString()}
                  </td>
                  {canManage && (
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setRemoveTarget(member)}
                        className="text-sm text-red-400 transition-colors hover:text-red-300"
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Danger zone */}
      {canManage && (
        <div className="mt-8 rounded-xl border border-red-500/20 bg-slate-900 p-6">
          <h2 className="text-base font-medium text-red-400">Danger zone</h2>
          <p className="mt-1 text-sm text-slate-400">
            Permanently delete this team. Issues linked to this team will not be affected.
          </p>
          <button
            type="button"
            onClick={() => setShowDeleteTeam(true)}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500"
          >
            Delete team
          </button>
        </div>
      )}

      {/* Add member modal */}
      {showAddMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-xl border border-slate-800/60 bg-slate-900 p-6">
            <h2 className="mb-4 text-base font-medium tracking-tight text-white">Add team member</h2>
            {addError && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
                <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6.25" /><path d="M8 5v3.5M8 10.5h.007" strokeLinecap="round" /></svg>
                <span>{addError}</span>
              </div>
            )}
            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400">Email</label>
                <input
                  type="email"
                  required
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400">Role</label>
                <Select
                  options={TEAM_ROLES}
                  value={newMemberRole}
                  onChange={(v) => setNewMemberRole(v as TeamRole)}
                  className="mt-1.5"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowAddMember(false); setAddError(""); }}
                  className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAdding}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                >
                  {isAdding ? "Adding..." : "Add member"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remove member confirm */}
      {removeTarget && (
        <ConfirmModal
          title="Remove member"
          message={`Remove ${removeTarget.user.first_name} ${removeTarget.user.last_name} from this team?`}
          confirmLabel="Remove"
          confirmVariant="danger"
          isLoading={isRemoving}
          onConfirm={handleRemoveMember}
          onCancel={() => setRemoveTarget(null)}
        />
      )}

      {/* Delete team confirm */}
      {showDeleteTeam && (
        <ConfirmModal
          title="Delete team"
          message={`Delete "${team.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          confirmVariant="danger"
          isLoading={isDeleting}
          onConfirm={handleDeleteTeam}
          onCancel={() => setShowDeleteTeam(false)}
        />
      )}
    </div>
  );
}
