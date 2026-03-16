"use client";

import { FormEvent, useState } from "react";
import { createIssue } from "@/lib/api/issues";
import { Select } from "@/components/ui/select";
import type {
  IssueStatus,
  IssuePriority,
  Milestone,
  Cycle,
  Label,
  ProjectMember,
} from "@/types";

const STATUS_OPTIONS: { value: IssueStatus; label: string }[] = [
  { value: "BACKLOG", label: "Backlog" },
  { value: "TODO", label: "Todo" },
  { value: "IN_PROGRESS", label: "In Progress" },
];

const PRIORITY_OPTIONS: { value: IssuePriority; label: string }[] = [
  { value: "NONE", label: "None" },
  { value: "URGENT", label: "Urgent" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

interface CreateIssueModalProps {
  projectId: string;
  members: ProjectMember[];
  milestones: Milestone[];
  cycles: Cycle[];
  labels: Label[];
  onClose: () => void;
  onCreated: () => void;
}

export function CreateIssueModal({
  projectId,
  members,
  milestones,
  cycles,
  labels,
  onClose,
  onCreated,
}: CreateIssueModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<IssueStatus>("BACKLOG");
  const [priority, setPriority] = useState<IssuePriority>("NONE");
  const [assigneeId, setAssigneeId] = useState("");
  const [milestoneId, setMilestoneId] = useState("");
  const [cycleId, setCycleId] = useState("");
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await createIssue(projectId, {
        title,
        description,
        status,
        priority,
        assignee_id: assigneeId || null,
        milestone_id: milestoneId || null,
        cycle_id: cycleId || null,
        label_ids: labelIds,
        due_date: dueDate || null,
      });
      onCreated();
      onClose();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })?.response?.data;
      setError(data ? Object.values(data).flat().join(" ") : "Failed to create issue.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function toggleLabel(id: string) {
    setLabelIds((prev) => prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-lg rounded-xl border border-slate-800/60 bg-slate-900 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="mb-4 text-base font-medium tracking-tight text-white">Create issue</h2>

        {error && <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400">Title</label>
            <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
              className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400">Status</label>
              <Select options={STATUS_OPTIONS} value={status} onChange={(v) => setStatus(v as IssueStatus)} className="mt-1.5" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400">Priority</label>
              <Select options={PRIORITY_OPTIONS} value={priority} onChange={(v) => setPriority(v as IssuePriority)} className="mt-1.5" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400">Assignee</label>
            <Select
              options={[{ value: "", label: "Unassigned" }, ...members.map((m) => ({ value: m.user.id, label: `${m.user.first_name} ${m.user.last_name}` }))]}
              value={assigneeId}
              onChange={(v) => setAssigneeId(v)}
              placeholder="Unassigned"
              className="mt-1.5"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {milestones.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-400">Milestone</label>
                <Select
                  options={[{ value: "", label: "None" }, ...milestones.map((m) => ({ value: m.id, label: m.name }))]}
                  value={milestoneId}
                  onChange={(v) => setMilestoneId(v)}
                  placeholder="None"
                  className="mt-1.5"
                />
              </div>
            )}
            {cycles.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-400">Cycle</label>
                <Select
                  options={[{ value: "", label: "None" }, ...cycles.map((c) => ({ value: c.id, label: c.name }))]}
                  value={cycleId}
                  onChange={(v) => setCycleId(v)}
                  placeholder="None"
                  className="mt-1.5"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400">Due date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors" />
          </div>

          {labels.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-400">Labels</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {labels.map((l) => (
                  <button key={l.id} type="button" onClick={() => toggleLabel(l.id)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                      labelIds.includes(l.id) ? "border-indigo-500 bg-indigo-600 text-white" : "border-slate-700 text-slate-400 hover:border-slate-600"
                    }`}>
                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
                    {l.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white">Cancel</button>
            <button type="submit" disabled={isSubmitting}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50">
              {isSubmitting ? "Creating..." : "Create issue"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
