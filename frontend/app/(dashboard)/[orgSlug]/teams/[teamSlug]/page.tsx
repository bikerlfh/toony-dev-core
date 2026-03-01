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
import type { TeamDetail, TeamMember, TeamRole } from "@/types";

const TEAM_ROLES: TeamRole[] = ["LEAD", "MEMBER"];

const ROLE_BADGE_COLORS: Record<TeamRole, string> = {
  LEAD: "bg-purple-100 text-purple-800",
  MEMBER: "bg-gray-100 text-gray-800",
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
    return <p className="text-gray-500">Loading team...</p>;
  }

  if (!team) {
    return <p className="text-red-500">Team not found.</p>;
  }

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{team.name}</h1>
          <span className="mt-1 inline-block rounded bg-gray-100 px-2 py-0.5 text-xs font-mono text-gray-600">
            {team.identifier}
          </span>
        </div>
        {canManage && !isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Edit
          </button>
        )}
      </div>

      {/* Edit form */}
      {isEditing && canManage && (
        <form onSubmit={handleSaveEdit} className="mt-4 rounded-lg border border-gray-200 bg-white p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input
              type="text"
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Description */}
      {!isEditing && team.description && (
        <p className="mt-3 text-sm text-gray-600">{team.description}</p>
      )}

      {/* Members */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Members</h2>
          {canManage && (
            <button
              onClick={() => setShowAddMember(true)}
              className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
            >
              Add member
            </button>
          )}
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Member</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Joined</th>
                {canManage && (
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {members.map((member) => (
                <tr key={member.id}>
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600">
                        {member.user.first_name?.[0]}{member.user.last_name?.[0]}
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-900">
                          {member.user.first_name} {member.user.last_name}
                        </p>
                        <p className="text-sm text-gray-500">{member.user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {canManage ? (
                      <select
                        value={member.role}
                        onChange={(e) => handleChangeRole(member, e.target.value as TeamRole)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      >
                        {TEAM_ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_BADGE_COLORS[member.role]}`}>
                        {member.role}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(member.joined_at).toLocaleDateString()}
                  </td>
                  {canManage && (
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setRemoveTarget(member)}
                        className="text-sm text-red-600 hover:underline"
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
        <div className="mt-8 rounded-lg border border-red-200 bg-white p-6">
          <h2 className="text-lg font-medium text-red-900">Danger zone</h2>
          <p className="mt-1 text-sm text-gray-600">
            Permanently delete this team. Issues linked to this team will not be affected.
          </p>
          <button
            type="button"
            onClick={() => setShowDeleteTeam(true)}
            className="mt-4 rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
          >
            Delete team
          </button>
        </div>
      )}

      {/* Add member modal */}
      {showAddMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Add team member</h2>
            {addError && (
              <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">{addError}</div>
            )}
            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  required
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Role</label>
                <select
                  value={newMemberRole}
                  onChange={(e) => setNewMemberRole(e.target.value as TeamRole)}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  {TEAM_ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowAddMember(false); setAddError(""); }}
                  className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAdding}
                  className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
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
