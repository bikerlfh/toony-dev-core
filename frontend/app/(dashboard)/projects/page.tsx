"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { listProjects } from "@/lib/api/projects";
import { StatusBadge } from "@/components/status-badge";
import { PriorityBadge } from "@/components/priority-badge";
import type { ProjectList } from "@/types";

export default function ProjectsPage() {
  const router = useRouter();

  const [projects, setProjects] = useState<ProjectList[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await listProjects();
      setProjects(res.results);
    } finally {
      setIsLoading(false);
    }
  }, []);

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
        <Link
          href="/projects/new"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          New project
        </Link>
      </div>

      {projects.length === 0 ? (
        <p className="mt-6 text-slate-500">No projects yet.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="cursor-pointer rounded-xl border border-slate-800/60 bg-slate-900 p-5 transition-colors hover:border-slate-600/50"
              onClick={() => router.push(`/projects/${project.id}`)}
            >
              {/* Header: name + org badge */}
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-semibold text-white leading-tight">
                  {project.name}
                </h3>
              </div>

              {/* Organization badge */}
              {project.organization && (
                <span className="mt-1.5 inline-block rounded-md bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
                  {project.organization.name}
                </span>
              )}

              {/* Status + Priority */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge status={project.status} />
                <PriorityBadge priority={project.priority} />
              </div>

              {/* Lead + Target date */}
              <div className="mt-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  {project.lead ? (
                    <>
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-700 text-xs font-medium text-slate-300">
                        {project.lead.first_name?.[0]?.toUpperCase() || project.lead.email[0].toUpperCase()}
                      </div>
                      <span className="text-slate-400">
                        {project.lead.first_name} {project.lead.last_name}
                      </span>
                    </>
                  ) : (
                    <span className="text-slate-600">Unassigned</span>
                  )}
                </div>
                <span className="text-xs text-slate-600">
                  {project.target_date
                    ? new Date(project.target_date).toLocaleDateString()
                    : "No target"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
