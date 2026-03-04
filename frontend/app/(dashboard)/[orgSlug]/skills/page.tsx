"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useOrg } from "@/contexts/org-context";
import { canEditOrg } from "@/lib/roles";
import { listSkills, deleteSkill } from "@/lib/api/skills";
import { ConfirmModal } from "@/components/confirm-modal";
import type { SkillList } from "@/types";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-800 text-slate-400",
  ACTIVE: "bg-green-900/50 text-green-400",
  INACTIVE: "bg-yellow-900/50 text-yellow-400",
  DEPRECATED: "bg-red-900/50 text-red-400",
};

const CATEGORY_LABELS: Record<string, string> = {
  CODING: "Coding",
  TESTING: "Testing",
  REVIEW: "Review",
  DOCUMENTATION: "Documentation",
  DEPLOYMENT: "Deployment",
  CUSTOM: "Custom",
};

export default function SkillsPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = params.orgSlug as string;
  const { currentMembership } = useOrg();

  const canManage = canEditOrg(currentMembership?.role);

  const [skills, setSkills] = useState<SkillList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<SkillList | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchSkills = useCallback(async () => {
    try {
      setSkills((await listSkills(orgSlug)).results);
    } finally {
      setIsLoading(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteSkill(deleteTarget.slug);
      setDeleteTarget(null);
      fetchSkills();
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium tracking-tight text-white">Skills</h1>
        {canManage && (
          <button
            onClick={() => router.push(`/${orgSlug}/skills/new`)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            Add skill
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="mt-4 text-slate-500">Loading skills...</p>
      ) : skills.length === 0 ? (
        <p className="mt-4 text-slate-500">No skills configured.</p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-800/60">
          <table className="min-w-full divide-y divide-slate-800/60">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">Version</th>
                {canManage && (
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-slate-500">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {skills.map((skill) => (
                <tr key={skill.id} className="hover:bg-slate-900/60">
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-200">
                    <span className="flex items-center gap-2">
                      {skill.name}
                      {skill.is_external && (
                        <span className="inline-flex rounded-full bg-purple-900/50 px-2 py-0.5 text-xs font-medium text-purple-400">
                          External
                        </span>
                      )}
                      {!skill.organization && (
                        <span className="inline-flex rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-400">
                          Global
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-400">
                    {CATEGORY_LABELS[skill.category] || skill.category}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[skill.status] || ""}`}>
                      {skill.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-400">
                    {skill.version}
                  </td>
                  {canManage && (
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      <button
                        onClick={() => router.push(`/${orgSlug}/skills/${skill.slug}/edit`)}
                        className="text-indigo-400 transition-colors hover:text-indigo-300"
                      >
                        Edit
                      </button>
                      <button onClick={() => setDeleteTarget(skill)} className="ml-3 text-red-400 transition-colors hover:text-red-300">
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
          title="Delete skill"
          message={`Delete skill "${deleteTarget.name}"? This will also remove it from all agents.`}
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
