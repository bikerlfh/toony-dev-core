"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useOrg } from "@/contexts/org-context";
import { canEditOrg } from "@/lib/roles";
import { listImportJobs, getImportJob } from "@/lib/api/imports";
import { StartImportWizard } from "@/components/start-import-wizard";
import type { ImportJob, ImportJobDetail } from "@/types";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-slate-800 text-slate-400",
  IN_PROGRESS: "bg-blue-500/15 text-blue-400",
  COMPLETED: "bg-emerald-500/15 text-emerald-400",
  FAILED: "bg-red-500/15 text-red-400",
  PARTIALLY_COMPLETED: "bg-amber-500/15 text-amber-400",
};

const PROVIDER_LABELS: Record<string, string> = {
  LINEAR: "Linear",
  JIRA: "Jira",
  TRELLO: "Trello",
  ASANA: "Asana",
  GITHUB_PROJECTS: "GitHub Projects",
};

export default function ImportsPage() {
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const { currentMembership } = useOrg();

  const canManage = canEditOrg(currentMembership?.role);

  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<ImportJobDetail | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      setJobs((await listImportJobs(orgSlug)).results);
    } finally {
      setIsLoading(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  async function handleViewJob(job: ImportJob) {
    const detail = await getImportJob(orgSlug, job.id);
    setSelectedJob(detail);
  }

  return (
    <div>
      <h1 className="text-2xl font-medium tracking-tight text-white">Imports</h1>

      {/* Wizard */}
      {canManage && (
        <div className="mt-6">
          <StartImportWizard orgSlug={orgSlug} onImportStarted={fetchJobs} />
        </div>
      )}

      {/* Import History */}
      <div className="mt-8">
        <h2 className="text-base font-medium text-white">Import History</h2>

        {isLoading ? (
          <p className="mt-4 text-slate-500">Loading imports...</p>
        ) : jobs.length === 0 ? (
          <p className="mt-4 text-slate-500">No imports yet.</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-800/60">
            <table className="min-w-full divide-y divide-slate-800/60">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">
                    Provider
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">
                    Progress
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">
                    Items
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">
                    Date
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-200">
                      {PROVIDER_LABELS[job.provider] || job.provider}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_COLORS[job.status] || ""
                        }`}
                      >
                        {job.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-400">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 rounded-full bg-slate-800">
                          <div
                            className="h-2 rounded-full bg-indigo-600"
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                        <span>{job.progress}%</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-400">
                      {job.imported_items}/{job.total_items}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-400">
                      {new Date(job.created_at).toLocaleDateString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      <button
                        onClick={() => handleViewJob(job)}
                        className="text-indigo-600 hover:underline"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-lg rounded-xl border border-slate-800/60 bg-slate-900 p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-medium tracking-tight text-white">
                Import Details
              </h2>
              <button
                onClick={() => setSelectedJob(null)}
                className="text-slate-500 hover:text-white transition-colors"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-500">Provider</span>
                <span className="font-medium">
                  {PROVIDER_LABELS[selectedJob.provider] || selectedJob.provider}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status</span>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    STATUS_COLORS[selectedJob.status] || ""
                  }`}
                >
                  {selectedJob.status.replace(/_/g, " ")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Progress</span>
                <span>{selectedJob.progress}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Items</span>
                <span>
                  {selectedJob.imported_items}/{selectedJob.total_items}
                </span>
              </div>
              {selectedJob.started_at && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Started</span>
                  <span>{new Date(selectedJob.started_at).toLocaleString()}</span>
                </div>
              )}
              {selectedJob.completed_at && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Completed</span>
                  <span>
                    {new Date(selectedJob.completed_at).toLocaleString()}
                  </span>
                </div>
              )}
              {selectedJob.started_by && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Started by</span>
                  <span>{selectedJob.started_by.email}</span>
                </div>
              )}
            </div>

            {selectedJob.error_log && selectedJob.error_log.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-red-400">
                  Errors ({selectedJob.error_log.length})
                </h3>
                <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-red-500/20 bg-red-500/10 p-3">
                  {selectedJob.error_log.map((err, i) => (
                    <div key={i} className="mb-1 text-xs text-red-400">
                      {err.title && (
                        <span className="font-medium">{err.title}: </span>
                      )}
                      {err.error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setSelectedJob(null)}
                className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
