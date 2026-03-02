"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { createProject } from "@/lib/api/projects";
import { listTeams } from "@/lib/api/teams";
import { Select } from "@/components/ui/select";
import type { Team, ProjectDetail, ProjectStatus, ProjectPriority } from "@/types";

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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

interface CreateProjectModalProps {
  orgSlug: string;
  onClose: () => void;
  onCreated: (project: ProjectDetail) => void;
}

const INPUT_CLASS =
  "mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors";

export function CreateProjectModal({ orgSlug, onClose, onCreated }: CreateProjectModalProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamSlug, setTeamSlug] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [shortSummary, setShortSummary] = useState("");
  const [description, setDescription] = useState("");
  const [statusVal, setStatusVal] = useState<ProjectStatus>("BACKLOG");
  const [priority, setPriority] = useState<ProjectPriority>("NONE");
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const fetchTeams = useCallback(async () => {
    const res = await listTeams(orgSlug);
    setTeams(res.results);
    if (res.results.length > 0) setTeamSlug(res.results[0].slug);
  }, [orgSlug]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  function handleNameChange(value: string) {
    setName(value);
    setSlug(slugify(value));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);

    const form = e.target as HTMLFormElement;
    if (!form.checkValidity()) return;

    setError("");
    setIsSubmitting(true);

    try {
      const project = await createProject(orgSlug, {
        team_slug: teamSlug,
        name,
        slug,
        description,
        short_summary: shortSummary,
        status: statusVal,
        priority,
        start_date: startDate || null,
        target_date: targetDate || null,
      });
      onCreated(project);
      onClose();
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-xl border border-slate-800/60 bg-slate-900 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="mb-4 text-base font-medium tracking-tight text-white">Create project</h2>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
            <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6.25" /><path d="M8 5v3.5M8 10.5h.007" strokeLinecap="round" /></svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className={`space-y-4 ${submitted ? "submitted" : ""}`}>
          <div>
            <label className="block text-sm font-medium text-slate-400">Team</label>
            <Select
              options={teams.map((t) => ({ value: t.slug, label: t.name }))}
              value={teamSlug}
              onChange={(v) => setTeamSlug(v)}
              required
              className="mt-1.5"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400">Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400">Slug</label>
            <input
              type="text"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className={`${INPUT_CLASS} font-mono`}
            />
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
            <label className="block text-sm font-medium text-slate-400">Description</label>
            <textarea
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={`${INPUT_CLASS} resize-none`}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400">Status</label>
              <Select options={STATUS_OPTIONS} value={statusVal} onChange={(v) => setStatusVal(v as ProjectStatus)} className="mt-1.5" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400">Priority</label>
              <Select options={PRIORITY_OPTIONS} value={priority} onChange={(v) => setPriority(v as ProjectPriority)} className="mt-1.5" />
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

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-600">esc to cancel</span>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || teams.length === 0}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
              >
                {isSubmitting ? "Creating..." : "Create project"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
