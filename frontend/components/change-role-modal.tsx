"use client";

import { FormEvent, useState } from "react";
import { updateMemberRole } from "@/lib/api/members";
import type { Member, MembershipRole } from "@/types";

const ROLES: MembershipRole[] = ["OWNER", "ADMIN", "MANAGER", "MEMBER", "VIEWER"];

interface ChangeRoleModalProps {
  orgSlug: string;
  member: Member;
  onClose: () => void;
  onChanged: () => void;
}

export function ChangeRoleModal({
  orgSlug,
  member,
  onClose,
  onChanged,
}: ChangeRoleModalProps) {
  const [role, setRole] = useState<MembershipRole>(member.role);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (role === member.role) {
      onClose();
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      await updateMemberRole(orgSlug, member.user.id, { role });
      onChanged();
      onClose();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      setError(detail || "Failed to update role.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Change role for {member.user.first_name} {member.user.last_name}
        </h2>

        {error && (
          <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as MembershipRole)}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
