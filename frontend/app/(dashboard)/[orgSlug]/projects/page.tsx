"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useOrg } from "@/contexts/org-context";
import { listProjects } from "@/lib/api/projects";
import { canCreateProject } from "@/lib/roles";
import { CreateProjectModal } from "@/components/create-project-modal";
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

  const canCreate = canCreateProject(currentMembership?.role);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await listProjects(orgSlug);
      setProjects(res.results);
    } finally {
      setIsLoading(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  if (isLoading) {
    return <p className="text-slate-500">Loading projects...</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium tracking-tight text-white">Projects</h1>
        {canCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            Create project
          </button>
        )}
      </div>

      {projects.length === 0 ? (
        <p className="mt-6 text-slate-500">No projects yet.</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-800/60">
          <table className="min-w-full divide-y divide-slate-800/60">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Project</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Priority</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Lead</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {projects.map((project) => (
                <tr
                  key={project.id}
                  className="cursor-pointer transition-colors hover:bg-slate-900/60"
                  onClick={() => router.push(`/${orgSlug}/projects/${project.slug}`)}
                >
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-slate-200">{project.name}</p>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={project.status} />
                  </td>
                  <td className="px-6 py-4">
                    <PriorityBadge priority={project.priority} />
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {project.lead
                      ? `${project.lead.first_name} ${project.lead.last_name}`
                      : "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {project.target_date
                      ? new Date(project.target_date).toLocaleDateString()
                      : "—"}
                  </td>
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

    </div>
  );
}
