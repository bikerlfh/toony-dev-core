"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useOrg } from "@/contexts/org-context";
import { canEditOrg } from "@/lib/roles";
import { listImportJobs, getImportJob } from "@/lib/api/imports";
import { StartImportWizard } from "@/components/start-import-wizard";
import type { ImportJob, ImportJobDetail } from "@/types";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-600",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
  PARTIALLY_COMPLETED: "bg-yellow-100 text-yellow-700",
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
      setJobs(await listImportJobs(orgSlug));
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
      <h1 className="text-2xl font-bold text-gray-900">Imports</h1>

      {/* Wizard */}
      {canManage && (
        <div className="mt-6">
          <StartImportWizard orgSlug={orgSlug} onImportStarted={fetchJobs} />
        </div>
      )}

      {/* Import History */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">Import History</h2>

        {isLoading ? (
          <p className="mt-4 text-gray-500">Loading imports...</p>
        ) : jobs.length === 0 ? (
          <p className="mt-4 text-gray-500">No imports yet.</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Provider
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Progress
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Items
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Date
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
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
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 rounded-full bg-gray-200">
                          <div
                            className="h-2 rounded-full bg-indigo-600"
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                        <span>{job.progress}%</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {job.imported_items}/{job.total_items}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Import Details
              </h2>
              <button
                onClick={() => setSelectedJob(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Provider</span>
                <span className="font-medium">
                  {PROVIDER_LABELS[selectedJob.provider] || selectedJob.provider}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    STATUS_COLORS[selectedJob.status] || ""
                  }`}
                >
                  {selectedJob.status.replace(/_/g, " ")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Progress</span>
                <span>{selectedJob.progress}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Items</span>
                <span>
                  {selectedJob.imported_items}/{selectedJob.total_items}
                </span>
              </div>
              {selectedJob.started_at && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Started</span>
                  <span>{new Date(selectedJob.started_at).toLocaleString()}</span>
                </div>
              )}
              {selectedJob.completed_at && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Completed</span>
                  <span>
                    {new Date(selectedJob.completed_at).toLocaleString()}
                  </span>
                </div>
              )}
              {selectedJob.started_by && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Started by</span>
                  <span>{selectedJob.started_by.email}</span>
                </div>
              )}
            </div>

            {selectedJob.error_log && selectedJob.error_log.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-red-700">
                  Errors ({selectedJob.error_log.length})
                </h3>
                <div className="mt-2 max-h-40 overflow-y-auto rounded border border-red-200 bg-red-50 p-3">
                  {selectedJob.error_log.map((err, i) => (
                    <div key={i} className="mb-1 text-xs text-red-600">
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
                className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
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
