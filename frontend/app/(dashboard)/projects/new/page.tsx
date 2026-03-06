"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createProject } from "@/lib/api/projects";
import { listOrganizations } from "@/lib/api/organizations";
import { Select } from "@/components/ui/select";
import type { Organization, ProjectStatus, ProjectPriority } from "@/types";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "BACKLOG", label: "Backlog" },
  { value: "PLANNED", label: "Planned" },
  { value: "IN_PROGRESS", label: "In Progress" },
];

const PRIORITY_OPTIONS: { value: ProjectPriority; label: string }[] = [
  { value: "NONE", label: "None" },
  { value: "URGENT", label: "Urgent" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

const INPUT_CLASS =
  "mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors";

export default function CreateProjectPage() {
  const router = useRouter();

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(true);

  const [orgId, setOrgId] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [issuePrefix, setIssuePrefix] = useState("");
  const [shortSummary, setShortSummary] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("BACKLOG");
  const [priority, setPriority] = useState<ProjectPriority>("NONE");
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const fetchOrgs = useCallback(async () => {
    try {
      const res = await listOrganizations();
      setOrganizations(res.results);
      if (res.results.length === 1) {
        setOrgId(res.results[0].id);
      }
    } finally {
      setIsLoadingOrgs(false);
    }
  }, []);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  function handleNameChange(value: string) {
    setName(value);
    setSlug(slugify(value));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);

    const form = e.target as HTMLFormElement;
    if (!form.checkValidity() || !orgId) return;

    setError("");
    setIsSubmitting(true);

    try {
      const project = await createProject({
        organization_id: orgId,
        name,
        slug,
        issue_prefix: issuePrefix,
        description,
        short_summary: shortSummary || undefined,
        status,
        priority,
        start_date: startDate || null,
        target_date: targetDate || null,
      });
      router.push(`/projects/${project.id}`);
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })
        ?.response?.data;
      if (data) {
        setError(Object.values(data).flat().join(" "));
      } else {
        setError("Failed to create project.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoadingOrgs) {
    return <p className="text-slate-500">Loading...</p>;
  }

  const orgOptions = organizations.map((o) => ({ value: o.id, label: o.name }));

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/projects"
          className="text-sm text-slate-500 transition-colors hover:text-slate-300"
        >
          &larr; Back to projects
        </Link>
      </div>

      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-medium tracking-tight text-white">Create project</h1>
        <p className="mt-1 text-sm text-slate-500">Set up a new project within an organization.</p>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
            <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="8" r="6.25" />
              <path d="M8 5v3.5M8 10.5h.007" strokeLinecap="round" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {organizations.length === 0 ? (
          <div className="mt-6 rounded-xl border border-slate-800/60 bg-slate-900 p-6 text-center">
            <p className="text-sm text-slate-400">You need at least one organization to create a project.</p>
            <Link
              href="/organizations/new"
              className="mt-3 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
            >
              Create organization
            </Link>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            noValidate
            className={`mt-6 space-y-5 ${submitted ? "submitted" : ""}`}
          >
            <div>
              <label className="block text-sm font-medium text-slate-400">
                Organization <span className="text-red-400">*</span>
              </label>
              <Select
                options={orgOptions}
                value={orgId}
                onChange={(v) => setOrgId(v)}
                placeholder="Select organization..."
                required
                className="mt-1.5"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="My Project"
                className={INPUT_CLASS}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400">
                Slug <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="my-project"
                className={`${INPUT_CLASS} font-mono`}
              />
              <p className="mt-1 text-xs text-slate-600">Used in URLs. Auto-generated from name.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400">
                Issue prefix <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={10}
                value={issuePrefix}
                onChange={(e) => setIssuePrefix(e.target.value.toUpperCase())}
                placeholder="ENG"
                className={`${INPUT_CLASS} font-mono uppercase`}
              />
              <p className="mt-1 text-xs text-slate-600">Used in issue identifiers (e.g. ENG-1, ENG-2).</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400">Short summary</label>
              <input
                type="text"
                value={shortSummary}
                onChange={(e) => setShortSummary(e.target.value)}
                maxLength={255}
                placeholder="A brief tagline for the project"
                className={INPUT_CLASS}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400">
                Description <span className="text-red-400">*</span>
              </label>
              <textarea
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Describe the project goals, scope, and deliverables"
                className={`${INPUT_CLASS} resize-none`}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-400">Status</label>
                <Select
                  options={STATUS_OPTIONS}
                  value={status}
                  onChange={(v) => setStatus(v as ProjectStatus)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400">Priority</label>
                <Select
                  options={PRIORITY_OPTIONS}
                  value={priority}
                  onChange={(v) => setPriority(v as ProjectPriority)}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-400">Start date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400">Target date</label>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Link
                href="/projects"
                className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
              >
                {isSubmitting ? "Creating..." : "Create project"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
