"use client";

import { FormEvent, useState } from "react";
import { updateSkill } from "@/lib/api/skills";
import { Select } from "@/components/ui/select";
import type { SkillDetail, SkillCategory, SkillStatus } from "@/types";

const CATEGORIES: { value: SkillCategory; label: string }[] = [
  { value: "CODING", label: "Coding" },
  { value: "TESTING", label: "Testing" },
  { value: "REVIEW", label: "Review" },
  { value: "DOCUMENTATION", label: "Documentation" },
  { value: "DEPLOYMENT", label: "Deployment" },
  { value: "CUSTOM", label: "Custom" },
];

const STATUSES: { value: SkillStatus; label: string }[] = [
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "DEPRECATED", label: "Deprecated" },
];

interface EditSkillModalProps {
  orgSlug: string;
  skill: SkillDetail;
  onClose: () => void;
  onSaved: () => void;
}

export function EditSkillModal({
  orgSlug,
  skill,
  onClose,
  onSaved,
}: EditSkillModalProps) {
  const [name, setName] = useState(skill.name);
  const [category, setCategory] = useState<SkillCategory>(skill.category);
  const [statusVal, setStatusVal] = useState<SkillStatus>(skill.status);
  const [version, setVersion] = useState(skill.version);
  const [description, setDescription] = useState(skill.description);
  const [content, setContent] = useState(skill.content);
  const [tags, setTags] = useState(skill.tags?.join(", ") || "");
  const [changelog, setChangelog] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await updateSkill(orgSlug, skill.slug, {
        name,
        category,
        status: statusVal,
        version,
        description,
        content,
        tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        changelog: changelog || undefined,
      });
      onSaved();
      onClose();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })
        ?.response?.data;
      if (data) {
        setError(Object.values(data).flat().join(" "));
      } else {
        setError("Failed to update skill.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-slate-800/60 bg-slate-900 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="mb-4 text-base font-medium tracking-tight text-white">
          Edit skill
        </h2>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
            <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6.25" /><path d="M8 5v3.5M8 10.5h.007" strokeLinecap="round" /></svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400">Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400">Category</label>
            <Select
              options={CATEGORIES}
              value={category}
              onChange={(v) => setCategory(v as SkillCategory)}
              className="mt-1.5"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400">Status</label>
            <Select
              options={STATUSES}
              value={statusVal}
              onChange={(v) => setStatusVal(v as SkillStatus)}
              className="mt-1.5"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400">Version</label>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400">Content (Markdown)</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400">
              Changelog <span className="text-slate-600">(for version history)</span>
            </label>
            <input
              type="text"
              value={changelog}
              onChange={(e) => setChangelog(e.target.value)}
              className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
              placeholder="Describe what changed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400">
              Tags <span className="text-slate-600">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : "Save skill"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
