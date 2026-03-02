"use client";

import { FormEvent, useState } from "react";
import { updateAgent } from "@/lib/api/agents";
import type { AgentDetail, AgentStatus, AgentType } from "@/types";

const AGENT_TYPES: { value: AgentType; label: string }[] = [
  { value: "CODER", label: "Coder" },
  { value: "REVIEWER", label: "Reviewer" },
  { value: "TESTER", label: "Tester" },
  { value: "PLANNER", label: "Planner" },
  { value: "CUSTOM", label: "Custom" },
];

const STATUSES: { value: AgentStatus; label: string }[] = [
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "DEPRECATED", label: "Deprecated" },
];

interface EditAgentModalProps {
  orgSlug: string;
  agent: AgentDetail;
  onClose: () => void;
  onSaved: () => void;
}

export function EditAgentModal({
  orgSlug,
  agent,
  onClose,
  onSaved,
}: EditAgentModalProps) {
  const [name, setName] = useState(agent.name);
  const [agentType, setAgentType] = useState<AgentType>(agent.agent_type);
  const [statusVal, setStatusVal] = useState<AgentStatus>(agent.status);
  const [version, setVersion] = useState(agent.version);
  const [description, setDescription] = useState(agent.description);
  const [encryptedConfiguration, setEncryptedConfiguration] = useState("");
  const [maxTasks, setMaxTasks] = useState(agent.max_concurrent_tasks);
  const [tags, setTags] = useState(agent.tags?.join(", ") || "");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        name,
        agent_type: agentType,
        status: statusVal,
        version,
        description,
        max_concurrent_tasks: maxTasks,
        tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      };
      if (encryptedConfiguration) {
        payload.encrypted_configuration = encryptedConfiguration;
      }
      await updateAgent(orgSlug, agent.slug, payload);
      onSaved();
      onClose();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })
        ?.response?.data;
      if (data) {
        setError(Object.values(data).flat().join(" "));
      } else {
        setError("Failed to update agent.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-slate-800/60 bg-slate-900 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="mb-4 text-base font-medium tracking-tight text-white">
          Edit agent
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
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400">Type</label>
            <select
              value={agentType}
              onChange={(e) => setAgentType(e.target.value as AgentType)}
              className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
            >
              {AGENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400">Status</label>
            <select
              value={statusVal}
              onChange={(e) => setStatusVal(e.target.value as AgentStatus)}
              className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
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
            <label className="block text-sm font-medium text-slate-400">
              Configuration (JSON) <span className="text-slate-600">(encrypted)</span>
            </label>
            <textarea
              value={encryptedConfiguration}
              onChange={(e) => setEncryptedConfiguration(e.target.value)}
              rows={2}
              className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
              placeholder="Enter new configuration to update"
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
              {isSubmitting ? "Saving..." : "Save agent"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
