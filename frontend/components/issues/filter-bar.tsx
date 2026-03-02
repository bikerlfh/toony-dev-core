"use client";

import { Select } from "@/components/ui/select";
import type { IssueFilters, IssuePriority, Milestone, Cycle, Label, ProjectMember } from "@/types";

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
  const hasFilters = filters.priority || filters.assignee_id ||
    filters.milestone_id || filters.cycle_id || (filters.label_ids && filters.label_ids.length > 0);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        options={[{ value: "", label: "All priorities" }, ...PRIORITY_OPTIONS]}
        value={filters.priority || ""}
        onChange={(v) => onChange({ ...filters, priority: (v || undefined) as IssuePriority | undefined })}
      />

      <Select
        options={[{ value: "", label: "All assignees" }, ...members.map((m) => ({ value: m.user.id, label: `${m.user.first_name} ${m.user.last_name}` }))]}
        value={filters.assignee_id || ""}
        onChange={(v) => onChange({ ...filters, assignee_id: v || undefined })}
      />

      {milestones.length > 0 && (
        <Select
          options={[{ value: "", label: "All milestones" }, ...milestones.map((m) => ({ value: m.id, label: m.name }))]}
          value={filters.milestone_id || ""}
          onChange={(v) => onChange({ ...filters, milestone_id: v || undefined })}
        />
      )}

      {cycles.length > 0 && (
        <Select
          options={[{ value: "", label: "All cycles" }, ...cycles.map((c) => ({ value: c.id, label: c.name }))]}
          value={filters.cycle_id || ""}
          onChange={(v) => onChange({ ...filters, cycle_id: v || undefined })}
        />
      )}

      {labels.length > 0 && (
        <Select
          options={labels.filter((l) => !(filters.label_ids || []).includes(l.id)).map((l) => ({ value: l.id, label: l.name }))}
          value=""
          onChange={(v) => {
            if (!v) return;
            const existing = filters.label_ids || [];
            if (!existing.includes(v)) {
              onChange({ ...filters, label_ids: [...existing, v] });
            }
          }}
          placeholder="Add label filter"
        />
      )}

      {(filters.label_ids || []).map((labelId) => {
        const label = labels.find((l) => l.id === labelId);
        if (!label) return null;
        return (
          <span key={labelId} className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-200">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: label.color }} />
            {label.name}
            <button
              onClick={() => onChange({ ...filters, label_ids: (filters.label_ids || []).filter((id) => id !== labelId) })}
              className="ml-0.5 text-slate-500 hover:text-white"
            >
              &times;
            </button>
          </span>
        );
      })}

      {hasFilters && (
        <button
          onClick={() => onChange({})}
          className="text-sm text-slate-500 hover:text-white transition-colors"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
