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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-xl border border-slate-800/60 bg-slate-900 p-6">
        <h2 className="mb-4 text-base font-medium tracking-tight text-white">
          Change role for {member.user.first_name} {member.user.last_name}
        </h2>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
            <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6.25" /><path d="M8 5v3.5M8 10.5h.007" strokeLinecap="round" /></svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as MembershipRole)}
              className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-600">esc to cancel</span>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
              >
                {isSubmitting ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
