"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useOrg } from "@/contexts/org-context";
import { listMembers, removeMember } from "@/lib/api/members";
import { canManageMembers } from "@/lib/roles";
import { AddMemberModal } from "@/components/add-member-modal";
import { ChangeRoleModal } from "@/components/change-role-modal";
import { ConfirmModal } from "@/components/confirm-modal";
import type { Member, MembershipRole } from "@/types";

const ROLE_BADGE_COLORS: Record<MembershipRole, string> = {
  OWNER: "bg-purple-100 text-purple-800",
  ADMIN: "bg-blue-100 text-blue-800",
  MANAGER: "bg-green-100 text-green-800",
  MEMBER: "bg-gray-100 text-gray-800",
  VIEWER: "bg-yellow-100 text-yellow-800",
};

export default function MembersPage() {
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const { currentMembership, refreshCurrentMembership } = useOrg();

  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddMember, setShowAddMember] = useState(false);
  const [changeRoleTarget, setChangeRoleTarget] = useState<Member | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const canManage = canManageMembers(currentMembership?.role);

  const fetchMembers = useCallback(async () => {
    try {
      const data = await listMembers(orgSlug);
      setMembers(data);
    } finally {
      setIsLoading(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  async function handleRemove() {
    if (!removeTarget) return;
    setIsRemoving(true);
    try {
      await removeMember(orgSlug, removeTarget.user.id);
      setRemoveTarget(null);
      fetchMembers();
      refreshCurrentMembership();
    } finally {
      setIsRemoving(false);
    }
  }

  if (isLoading) {
    return <p className="text-gray-500">Loading members...</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Members</h1>
        {canManage && (
          <button
            onClick={() => setShowAddMember(true)}
            className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
          >
            Add member
          </button>
        )}
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Member
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Joined
              </th>
              {canManage && (
                <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {members.map((member) => (
              <tr key={member.id}>
                <td className="px-6 py-4">
                  <div className="flex items-center">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600">
                      {member.user.first_name?.[0]}
                      {member.user.last_name?.[0]}
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-900">
                        {member.user.first_name} {member.user.last_name}
                      </p>
                      <p className="text-sm text-gray-500">
                        {member.user.email}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_BADGE_COLORS[member.role]}`}
                  >
                    {member.role}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {new Date(member.joined_at).toLocaleDateString()}
                </td>
                {canManage && (
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setChangeRoleTarget(member)}
                        className="text-sm text-indigo-600 hover:underline"
                      >
                        Change role
                      </button>
                      <button
                        onClick={() => setRemoveTarget(member)}
                        className="text-sm text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAddMember && (
        <AddMemberModal
          orgSlug={orgSlug}
          onClose={() => setShowAddMember(false)}
          onAdded={fetchMembers}
        />
      )}

      {changeRoleTarget && (
        <ChangeRoleModal
          orgSlug={orgSlug}
          member={changeRoleTarget}
          onClose={() => setChangeRoleTarget(null)}
          onChanged={() => {
            fetchMembers();
            refreshCurrentMembership();
          }}
        />
      )}

      {removeTarget && (
        <ConfirmModal
          title="Remove member"
          message={`Remove ${removeTarget.user.first_name} ${removeTarget.user.last_name} from this organization?`}
          confirmLabel="Remove"
          confirmVariant="danger"
          isLoading={isRemoving}
          onConfirm={handleRemove}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
    </div>
  );
}
