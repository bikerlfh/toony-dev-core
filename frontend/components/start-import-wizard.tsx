"use client";

import { useEffect, useState } from "react";
import { listExternalProjects } from "@/lib/api/imports";
import { listProjects } from "@/lib/api/projects";
import { startImport } from "@/lib/api/imports";
import { Select } from "@/components/ui/select";
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
            <Select
              options={PROVIDERS}
              value={provider}
              onChange={(v) => {
                setProvider(v as ImportProvider);
                setStep(1);
                setExternalProjects([]);
                setSelectedExternal("");
              }}
              placeholder="Choose provider..."
              className="w-full max-w-xs"
            />
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
            <Select
              options={externalProjects.map((ep) => ({ value: ep.id, label: ep.name }))}
              value={selectedExternal}
              onChange={(v) => {
                setSelectedExternal(v);
                if (v) setStep(3);
              }}
              placeholder="Choose project..."
              className="mt-1.5 max-w-xs"
            />
          </div>
        )}

        {/* Step 3: Select target + confirm */}
        {step >= 3 && selectedExternal && (
          <div>
            <label className="block text-sm font-medium text-slate-400">
              Step 3: Select target project
            </label>
            <Select
              options={projects.map((p) => ({ value: p.slug, label: p.name }))}
              value={targetProjectSlug}
              onChange={(v) => setTargetProjectSlug(v)}
              placeholder="Choose target project..."
              className="mt-1.5 max-w-xs"
            />

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
