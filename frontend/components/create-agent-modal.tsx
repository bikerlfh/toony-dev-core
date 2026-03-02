"use client";

import { FormEvent, useState } from "react";
import { createAgent } from "@/lib/api/agents";
import { Select } from "@/components/ui/select";
import type { AgentType } from "@/types";

const AGENT_TYPES: { value: AgentType; label: string }[] = [
  { value: "CODER", label: "Coder" },
  { value: "REVIEWER", label: "Reviewer" },
  { value: "TESTER", label: "Tester" },
  { value: "PLANNER", label: "Planner" },
  { value: "CUSTOM", label: "Custom" },
];

interface CreateAgentModalProps {
  orgSlug: string;
  onClose: () => void;
  onSaved: () => void;
}

export function CreateAgentModal({
  orgSlug,
  onClose,
  onSaved,
}: CreateAgentModalProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [agentType, setAgentType] = useState<AgentType>("CUSTOM");
  const [version, setVersion] = useState("0.1.0");
  const [description, setDescription] = useState("");
  const [encryptedConfiguration, setEncryptedConfiguration] = useState("");
  const [maxTasks, setMaxTasks] = useState(1);
  const [tags, setTags] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await createAgent(orgSlug, {
        name,
        slug,
        agent_type: agentType,
        version,
        description: description || undefined,
        encrypted_configuration: encryptedConfiguration || undefined,
        max_concurrent_tasks: maxTasks,
        tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      });
      onSaved();
      onClose();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })
        ?.response?.data;
      if (data) {
        setError(Object.values(data).flat().join(" "));
      } else {
        setError("Failed to create agent.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-slate-800/60 bg-slate-900 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="mb-4 text-base font-medium tracking-tight text-white">
          Create agent
        </h2>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
            <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6.25" /><path d="M8 5v3.5M8 10.5h.007" strokeLinecap="round" /></svg>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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
            <label className="block text-sm font-medium text-slate-400">Slug</label>
            <input
              type="text"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400">Type</label>
            <Select
              options={AGENT_TYPES}
              value={agentType}
              onChange={(v) => setAgentType(v as AgentType)}
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
              Description <span className="text-slate-600">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400">
              Configuration (JSON) <span className="text-slate-600">(encrypted)</span>
            </label>
            <textarea
              value={encryptedConfiguration}
              onChange={(e) => setEncryptedConfiguration(e.target.value)}
              rows={2}
              className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
              placeholder='{"model": "claude-sonnet-4-6", "temperature": 0.7}'
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400">Max concurrent tasks</label>
            <input
              type="number"
              min={1}
              value={maxTasks}
              onChange={(e) => setMaxTasks(parseInt(e.target.value) || 1)}
              className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
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
              placeholder="python, django, postgres"
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
              {isSubmitting ? "Creating..." : "Create agent"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
