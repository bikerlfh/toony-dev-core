"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSubAgent } from "@/lib/api/sub-agents";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { Select } from "@/components/ui/select";
import type { SubAgentType } from "@/types";

const AGENT_TYPES: { value: SubAgentType; label: string }[] = [
  { value: "CODER", label: "Coder" },
  { value: "REVIEWER", label: "Reviewer" },
  { value: "TESTER", label: "Tester" },
  { value: "PLANNER", label: "Planner" },
  { value: "CUSTOM", label: "Custom" },
];

export default function NewSubAgentPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [agentType, setAgentType] = useState<SubAgentType>("CUSTOM");
  const [version, setVersion] = useState("0.1.0");
  const [description, setDescription] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [tags, setTags] = useState("");
  const [isExternal, setIsExternal] = useState(false);
  const [externalCommand, setExternalCommand] = useState("");
  const [isGlobal, setIsGlobal] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await createSubAgent({
        name,
        slug,
        organization: isGlobal ? null : undefined,
        agent_type: agentType,
        version,
        description: description || undefined,
        markdown: markdown || undefined,
        is_external: isExternal,
        external_command: isExternal ? externalCommand : undefined,
        tags: tags
          ? tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
      });
      router.push(`/subagents`);
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })
        ?.response?.data;
      if (data) {
        setError(Object.values(data).flat().join(" "));
      } else {
        setError("Failed to create sub-agent.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => router.push(`/subagents`)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 3L5 8l5 5" />
          </svg>
        </button>
        <h1 className="text-2xl font-medium tracking-tight text-white">Create sub-agent</h1>
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
              placeholder={"# Sub-agent instructions\n\nDescribe what this sub-agent does..."}
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
                    onChange={(e) => handleNameChange(e.target.value)}
                    className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
                    placeholder="Backend Builder"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400">Type</label>
                  <Select
                    options={AGENT_TYPES}
                    value={agentType}
                    onChange={(v) => setAgentType(v as SubAgentType)}
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
                  <label className="block text-sm font-medium text-slate-400">
                    Description <span className="text-slate-600">(max 250)</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={250}
                    required
                    rows={2}
                    className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
                  />
                  <p className="mt-1 text-xs text-slate-600">{description.length}/250</p>
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
                    placeholder="python, django, postgres"
                  />
                </div>
              </div>
            </div>

            {/* Scope section */}
            <div className="rounded-xl border border-slate-800/60 bg-slate-900 p-4">
              <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-slate-500">Scope</h3>
              <label className="flex items-center gap-2.5 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={isGlobal}
                  onChange={(e) => setIsGlobal(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
                />
                Global (not tied to any organization)
              </label>
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
                External agent
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
                    placeholder="docker run my-agent:latest"
                  />
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => router.push(`/subagents`)}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
              >
                {isSubmitting ? "Creating..." : "Create sub-agent"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
