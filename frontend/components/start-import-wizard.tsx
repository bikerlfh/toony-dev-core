"use client";

import { useEffect, useState } from "react";
import { listExternalProjects } from "@/lib/api/imports";
import { listProjects } from "@/lib/api/projects";
import { startImport } from "@/lib/api/imports";
import type { ExternalProject, ImportProvider, ProjectList } from "@/types";

const PROVIDERS: { value: ImportProvider; label: string }[] = [
  { value: "LINEAR", label: "Linear" },
  { value: "JIRA", label: "Jira" },
  { value: "TRELLO", label: "Trello" },
  { value: "ASANA", label: "Asana" },
  { value: "GITHUB_PROJECTS", label: "GitHub Projects" },
];

interface StartImportWizardProps {
  orgSlug: string;
  onImportStarted: () => void;
}

export function StartImportWizard({
  orgSlug,
  onImportStarted,
}: StartImportWizardProps) {
  const [step, setStep] = useState(1);
  const [provider, setProvider] = useState<ImportProvider | "">("");
  const [externalProjects, setExternalProjects] = useState<ExternalProject[]>([]);
  const [selectedExternal, setSelectedExternal] = useState("");
  const [projects, setProjects] = useState<ProjectList[]>([]);
  const [targetProjectSlug, setTargetProjectSlug] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listProjects(orgSlug).then(setProjects).catch(() => {});
  }, [orgSlug]);

  async function handleLoadProjects() {
    if (!provider) return;
    setError("");
    setIsLoading(true);
    try {
      const ext = await listExternalProjects(orgSlug, provider as ImportProvider);
      setExternalProjects(ext);
      if (ext.length === 0) {
        setError("No projects found. Check your integration configuration.");
      } else {
        setStep(2);
      }
    } catch {
      setError("Failed to load external projects. Verify the integration is configured and active.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleStartImport() {
    if (!provider || !selectedExternal || !targetProjectSlug) return;
    setError("");
    setIsImporting(true);
    try {
      await startImport(orgSlug, {
        provider: provider as ImportProvider,
        external_project_id: selectedExternal,
        target_project_slug: targetProjectSlug,
      });
      setStep(1);
      setProvider("");
      setSelectedExternal("");
      setTargetProjectSlug("");
      setExternalProjects([]);
      onImportStarted();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })
        ?.response?.data;
      if (data) {
        setError(Object.values(data).flat().join(" "));
      } else {
        setError("Failed to start import.");
      }
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900">Start Import</h2>
      <p className="mt-1 text-sm text-gray-500">
        Import issues from an external tool into a project.
      </p>

      {error && (
        <div className="mt-4 rounded bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Step 1: Select provider */}
      <div className="mt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Step 1: Select provider
          </label>
          <div className="mt-1 flex gap-3">
            <select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value as ImportProvider);
                setStep(1);
                setExternalProjects([]);
                setSelectedExternal("");
              }}
              className="block w-full max-w-xs rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="">Choose provider...</option>
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <button
              onClick={handleLoadProjects}
              disabled={!provider || isLoading}
              className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isLoading ? "Loading..." : "Load projects"}
            </button>
          </div>
        </div>

        {/* Step 2: Select external project */}
        {step >= 2 && externalProjects.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Step 2: Select external project
            </label>
            <select
              value={selectedExternal}
              onChange={(e) => {
                setSelectedExternal(e.target.value);
                if (e.target.value) setStep(3);
              }}
              className="mt-1 block w-full max-w-xs rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="">Choose project...</option>
              {externalProjects.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  {ep.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Step 3: Select target + confirm */}
        {step >= 3 && selectedExternal && (
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Step 3: Select target project
            </label>
            <select
              value={targetProjectSlug}
              onChange={(e) => setTargetProjectSlug(e.target.value)}
              className="mt-1 block w-full max-w-xs rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="">Choose target project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>

            {targetProjectSlug && (
              <button
                onClick={handleStartImport}
                disabled={isImporting}
                className="mt-3 rounded bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
              >
                {isImporting ? "Importing..." : "Start import"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
