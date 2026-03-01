"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useOrg } from "@/contexts/org-context";
import { listProjects, deleteProject } from "@/lib/api/projects";
import { canCreateProject } from "@/lib/roles";
import { CreateProjectModal } from "@/components/create-project-modal";
import { ConfirmModal } from "@/components/confirm-modal";
import { StatusBadge } from "@/components/status-badge";
import { PriorityBadge } from "@/components/priority-badge";
import type { ProjectList } from "@/types";

export default function ProjectsPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = params.orgSlug as string;
  const { currentMembership } = useOrg();

  const [projects, setProjects] = useState<ProjectList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectList | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const canCreate = canCreateProject(currentMembership?.role);

  const fetchProjects = useCallback(async () => {
    try {
      const data = await listProjects(orgSlug);
      setProjects(data);
    } finally {
      setIsLoading(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteProject(orgSlug, deleteTarget.slug);
      setDeleteTarget(null);
      fetchProjects();
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return <p className="text-gray-500">Loading projects...</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
        {canCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
          >
            Create project
          </button>
        )}
      </div>

      {projects.length === 0 ? (
        <p className="mt-6 text-gray-500">No projects yet.</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Project</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Team</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Priority</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Lead</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Target</th>
                {canCreate && (
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {projects.map((project) => (
                <tr
                  key={project.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => router.push(`/${orgSlug}/projects/${project.slug}`)}
                >
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-gray-900">{project.name}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-mono text-gray-600">
                      {project.team.identifier}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={project.status} />
                  </td>
                  <td className="px-6 py-4">
                    <PriorityBadge priority={project.priority} />
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {project.lead
                      ? `${project.lead.first_name} ${project.lead.last_name}`
                      : "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {project.target_date
                      ? new Date(project.target_date).toLocaleDateString()
                      : "—"}
                  </td>
                  {canCreate && (
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(project);
                        }}
                        className="text-sm text-red-600 hover:underline"
                      >
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

      {showCreate && (
        <CreateProjectModal
          orgSlug={orgSlug}
          onClose={() => setShowCreate(false)}
          onCreated={() => fetchProjects()}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete project"
          message={`Delete project "${deleteTarget.name}"? All issues, milestones, and cycles will be permanently deleted.`}
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
