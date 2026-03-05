"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSkill, updateSkill } from "@/lib/api/skills";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
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

export default function EditSkillPage() {
  const params = useParams();
  const router = useRouter();
  const skillId = params.id as string;

  const [skill, setSkill] = useState<SkillDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<SkillCategory>("CUSTOM");
  const [statusVal, setStatusVal] = useState<SkillStatus>("DRAFT");
  const [version, setVersion] = useState("");
  const [description, setDescription] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [tags, setTags] = useState("");
  const [changelog, setChangelog] = useState("");
  const [isExternal, setIsExternal] = useState(false);
  const [externalCommand, setExternalCommand] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchSkill = useCallback(async () => {
    try {
      const data = await getSkill(skillId);
      setSkill(data);
      setName(data.name);
      setCategory(data.category);
      setStatusVal(data.status);
      setVersion(data.version);
      setDescription(data.description);
      setMarkdown(data.markdown);
      setTags(data.tags?.join(", ") || "");
      setIsExternal(data.is_external);
      setExternalCommand(data.external_command);
    } finally {
      setIsLoading(false);
    }
  }, [skillId]);

  useEffect(() => {
    fetchSkill();
  }, [fetchSkill]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await updateSkill(skillId, {
        name,
        category,
        status: statusVal,
        version,
        description,
        markdown,
        is_external: isExternal,
        external_command: isExternal ? externalCommand : "",
        tags: tags
          ? tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
        changelog: changelog || undefined,
      });
      router.push(`/skills`);
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

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 pt-12 text-slate-500">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-1 w-6 rounded-full bg-slate-700 animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
        Loading skill...
      </div>
    );
  }

  if (!skill) {
    return <p className="pt-12 text-slate-500">Skill not found.</p>;
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => router.push(`/skills`)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 3L5 8l5 5" />
          </svg>
        </button>
        <div>
          <h1 className="text-2xl font-medium tracking-tight text-white">{skill.name}</h1>
          <p className="font-mono text-sm text-slate-500">{skill.slug}</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
          <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6.25" /><path d="M8 5v3.5M8 10.5h.007" strokeLinecap="round" /></svg>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Left — Markdown editor */}
          <div className="flex-1 lg:min-w-0">
            <MarkdownEditor
              label="Markdown"
              value={markdown}
              onChange={setMarkdown}
              placeholder="# Skill instructions..."
              rows={28}
            />
          </div>

          {/* Right — Properties */}
          <div className="w-full space-y-4 lg:w-80 xl:w-96">
            <div className="rounded-xl border border-slate-800/60 bg-slate-900 p-4">
              <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-slate-500">Properties</h3>

              <div className="space-y-4">
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
                    required
                    rows={2}
                    className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
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
              </div>
            </div>

            {/* External section */}
            <div className="rounded-xl border border-slate-800/60 bg-slate-900 p-4">
              <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-slate-500">External</h3>
              <label className="flex items-center gap-2.5 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={isExternal}
                  onChange={(e) => setIsExternal(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
                />
                External skill
              </label>
              {isExternal && (
                <div className="mt-3">
                  <label className="block text-sm font-medium text-slate-400">External command</label>
                  <input
                    type="text"
                    required
                    value={externalCommand}
                    onChange={(e) => setExternalCommand(e.target.value)}
                    className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
                    placeholder="npx @my-org/skill-runner"
                  />
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => router.push(`/skills`)}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
              >
                {isSubmitting ? "Saving..." : "Save skill"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
