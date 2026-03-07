"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createWorkflow } from "@/lib/api/workflows";
import { listOrganizations } from "@/lib/api/organizations";
import { listProjects } from "@/lib/api/projects";
import { listLabels } from "@/lib/api/workspace";
import { Select } from "@/components/ui/select";
import type {
  Organization,
  ProjectList,
  Label,
  CreateWorkflowPayload,
} from "@/types";

type ScopeKind = "GLOBAL" | "ORGANIZATION" | "PROJECT";

const SCOPE_OPTIONS: { value: ScopeKind; label: string }[] = [
  { value: "GLOBAL", label: "Global" },
  { value: "ORGANIZATION", label: "Organization" },
  { value: "PROJECT", label: "Project" },
];

export default function NewWorkflowPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<ScopeKind>("GLOBAL");
  const [organizationId, setOrganizationId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [labelId, setLabelId] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<ProjectList[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);

  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  /* ── Load dropdown data ──────────────────────────── */

  const fetchDropdowns = useCallback(async () => {
    const [orgRes, projRes, labelRes] = await Promise.all([
      listOrganizations(),
      listProjects(),
      listLabels(),
    ]);
    setOrganizations(orgRes.results);
    setProjects(projRes.results);
    setLabels(labelRes.results);
  }, []);

  useEffect(() => {
    fetchDropdowns();
  }, [fetchDropdowns]);

  /* ── Slug auto-generation ────────────────────────── */

  function handleNameChange(value: string) {
    setName(value);
    setSlug(
      value
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
    );
  }

  /* ── Submit ──────────────────────────────────────── */

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const payload: CreateWorkflowPayload = {
        name,
        slug,
        description: description || undefined,
        is_active: isActive,
        organization:
          scope === "ORGANIZATION" && organizationId
            ? organizationId
            : undefined,
        project:
          scope === "PROJECT" && projectId ? projectId : undefined,
        label: labelId || undefined,
      };

      const created = await createWorkflow(payload);
      router.push(`/workflows/${created.id}/edit`);
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })
        ?.response?.data;
      if (data) {
        setError(Object.values(data).flat().join(" "));
      } else {
        setError("Failed to create workflow.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  /* ── Filtered projects (by org if org-scoped) ──── */

  const filteredProjects =
    scope === "PROJECT" && organizationId
      ? projects.filter((p) => p.organization?.id === organizationId)
      : projects;

  /* ── Render ──────────────────────────────────────── */

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => router.push("/workflows")}
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 3L5 8l5 5" />
          </svg>
        </button>
        <h1 className="text-2xl font-medium tracking-tight text-white">
          Create workflow
        </h1>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
          <svg
            className="mt-0.5 h-4 w-4 shrink-0"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="8" cy="8" r="6.25" />
            <path d="M8 5v3.5M8 10.5h.007" strokeLinecap="round" />
          </svg>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mx-auto max-w-xl space-y-6">
          {/* Properties card */}
          <div className="rounded-xl border border-slate-800/60 bg-slate-900 p-5">
            <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-slate-500">
              Properties
            </h3>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-slate-400">
                  Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
                  placeholder="Bug Triage Pipeline"
                />
              </div>

              {/* Slug */}
              <div>
                <label className="block text-sm font-medium text-slate-400">
                  Slug
                </label>
                <input
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
                  placeholder="bug-triage-pipeline"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-400">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
                  placeholder="Describe what this workflow does..."
                />
              </div>

              {/* Active toggle */}
              <label className="flex items-center gap-2.5 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
                />
                Active
              </label>
            </div>
          </div>

          {/* Scope card */}
          <div className="rounded-xl border border-slate-800/60 bg-slate-900 p-5">
            <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-slate-500">
              Scope
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400">
                  Scope
                </label>
                <Select
                  options={SCOPE_OPTIONS}
                  value={scope}
                  onChange={(v) => {
                    setScope(v as ScopeKind);
                    if (v === "GLOBAL") {
                      setOrganizationId("");
                      setProjectId("");
                    }
                    if (v === "ORGANIZATION") {
                      setProjectId("");
                    }
                  }}
                  className="mt-1.5"
                />
              </div>

              {scope === "ORGANIZATION" && (
                <div>
                  <label className="block text-sm font-medium text-slate-400">
                    Organization
                  </label>
                  <Select
                    options={organizations.map((o) => ({
                      value: o.id,
                      label: o.name,
                    }))}
                    value={organizationId}
                    onChange={setOrganizationId}
                    placeholder="Select organization..."
                    required
                    className="mt-1.5"
                  />
                </div>
              )}

              {scope === "PROJECT" && (
                <div>
                  <label className="block text-sm font-medium text-slate-400">
                    Project
                  </label>
                  <Select
                    options={filteredProjects.map((p) => ({
                      value: p.id,
                      label: p.name,
                    }))}
                    value={projectId}
                    onChange={setProjectId}
                    placeholder="Select project..."
                    required
                    className="mt-1.5"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Label card */}
          <div className="rounded-xl border border-slate-800/60 bg-slate-900 p-5">
            <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-slate-500">
              Label trigger
            </h3>
            <p className="mb-3 text-xs text-slate-500">
              Optionally bind this workflow to a label. When the label is applied
              to an issue, this workflow will be triggered.
            </p>
            <Select
              options={[
                { value: "", label: "None (default workflow)" },
                ...labels.map((l) => ({ value: l.id, label: l.name })),
              ]}
              value={labelId}
              onChange={setLabelId}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push("/workflows")}
              className="flex-1 rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              {isSubmitting ? "Creating..." : "Create workflow"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
