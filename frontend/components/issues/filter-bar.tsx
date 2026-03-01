"use client";

import type { IssueFilters, IssueStatus, IssuePriority, Milestone, Cycle, Label, ProjectMember } from "@/types";

const STATUS_OPTIONS: { value: IssueStatus; label: string }[] = [
  { value: "BACKLOG", label: "Backlog" },
  { value: "TODO", label: "Todo" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "IN_REVIEW", label: "In Review" },
  { value: "DONE", label: "Done" },
  { value: "CANCELED", label: "Canceled" },
];

const PRIORITY_OPTIONS: { value: IssuePriority; label: string }[] = [
  { value: "NONE", label: "None" },
  { value: "URGENT", label: "Urgent" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

interface FilterBarProps {
  filters: IssueFilters;
  onChange: (filters: IssueFilters) => void;
  members: ProjectMember[];
  milestones: Milestone[];
  cycles: Cycle[];
  labels: Label[];
}

export function FilterBar({
  filters,
  onChange,
  members,
  milestones,
  cycles,
  labels,
}: FilterBarProps) {
  const hasFilters = filters.status || filters.priority || filters.assignee_id ||
    filters.milestone_id || filters.cycle_id || (filters.label_ids && filters.label_ids.length > 0);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={filters.status || ""}
        onChange={(e) => onChange({ ...filters, status: (e.target.value || undefined) as IssueStatus | undefined })}
        className="rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
      >
        <option value="">All statuses</option>
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <select
        value={filters.priority || ""}
        onChange={(e) => onChange({ ...filters, priority: (e.target.value || undefined) as IssuePriority | undefined })}
        className="rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
      >
        <option value="">All priorities</option>
        {PRIORITY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <select
        value={filters.assignee_id || ""}
        onChange={(e) => onChange({ ...filters, assignee_id: e.target.value || undefined })}
        className="rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
      >
        <option value="">All assignees</option>
        {members.map((m) => (
          <option key={m.user.id} value={m.user.id}>
            {m.user.first_name} {m.user.last_name}
          </option>
        ))}
      </select>

      {milestones.length > 0 && (
        <select
          value={filters.milestone_id || ""}
          onChange={(e) => onChange({ ...filters, milestone_id: e.target.value || undefined })}
          className="rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        >
          <option value="">All milestones</option>
          {milestones.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      )}

      {cycles.length > 0 && (
        <select
          value={filters.cycle_id || ""}
          onChange={(e) => onChange({ ...filters, cycle_id: e.target.value || undefined })}
          className="rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        >
          <option value="">All cycles</option>
          {cycles.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      )}

      {labels.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            const existing = filters.label_ids || [];
            if (!existing.includes(id)) {
              onChange({ ...filters, label_ids: [...existing, id] });
            }
          }}
          className="rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        >
          <option value="">Add label filter</option>
          {labels.filter((l) => !(filters.label_ids || []).includes(l.id)).map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      )}

      {(filters.label_ids || []).map((labelId) => {
        const label = labels.find((l) => l.id === labelId);
        if (!label) return null;
        return (
          <span key={labelId} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: label.color }} />
            {label.name}
            <button
              onClick={() => onChange({ ...filters, label_ids: (filters.label_ids || []).filter((id) => id !== labelId) })}
              className="ml-0.5 text-gray-500 hover:text-gray-700"
            >
              &times;
            </button>
          </span>
        );
      })}

      {hasFilters && (
        <button
          onClick={() => onChange({})}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
