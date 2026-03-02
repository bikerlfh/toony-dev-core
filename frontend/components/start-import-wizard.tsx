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
    listProjects(orgSlug).then((res) => setProjects(res.results)).catch(() => {});
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
    <div className="rounded-xl border border-slate-800/60 bg-slate-900 p-6">
      <h2 className="text-base font-medium tracking-tight text-white">Start Import</h2>
      <p className="mt-1 text-sm text-slate-400">
        Import issues from an external tool into a project.
      </p>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
          <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6.25" /><path d="M8 5v3.5M8 10.5h.007" strokeLinecap="round" /></svg>
          <span>{error}</span>
        </div>
      )}

      {/* Step 1: Select provider */}
      <div className="mt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-400">
            Step 1: Select provider
          </label>
          <div className="mt-1.5 flex gap-3">
            <select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value as ImportProvider);
                setStep(1);
                setExternalProjects([]);
                setSelectedExternal("");
              }}
              className="block w-full max-w-xs rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
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
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              {isLoading ? "Loading..." : "Load projects"}
            </button>
          </div>
        </div>

        {/* Step 2: Select external project */}
        {step >= 2 && externalProjects.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-slate-400">
              Step 2: Select external project
            </label>
            <select
              value={selectedExternal}
              onChange={(e) => {
                setSelectedExternal(e.target.value);
                if (e.target.value) setStep(3);
              }}
              className="mt-1.5 block w-full max-w-xs rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
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
            <label className="block text-sm font-medium text-slate-400">
              Step 3: Select target project
            </label>
            <select
              value={targetProjectSlug}
              onChange={(e) => setTargetProjectSlug(e.target.value)}
              className="mt-1.5 block w-full max-w-xs rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
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
                className="mt-3 rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
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
