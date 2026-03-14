# Quick Create Issue Modal — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Linear-style "Create issue" modal to the Tasks page with pill-button field selectors and cross-project support.

**Architecture:** A single new component `QuickCreateIssueModal` renders a modal with inline title/description inputs and a pill bar. Each pill opens a dropdown popover for field selection. Project selection triggers dynamic fetching of members, milestones, cycles, and labels. The modal is mounted from the Tasks page via a button in the filter bar.

**Tech Stack:** React 19, TypeScript 5.9, Tailwind CSS v4, Axios (existing API functions)

**Design doc:** `docs/plans/2026-03-14-quick-create-issue-modal-design.md`

---

### Task 1: Create the PillDropdown reusable sub-component

This is the core UI primitive — a pill button that toggles an anchored dropdown with selectable options.

**Files:**
- Create: `frontend/components/tasks/pill-dropdown.tsx`

**Step 1: Create `PillDropdown` component**

```tsx
"use client";

import { useState, useRef, useEffect } from "react";

interface PillOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  color?: string;
}

interface PillDropdownProps {
  label: string;
  icon?: React.ReactNode;
  options: PillOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  /** When true, allows selecting multiple values. Use `selectedValues`/`onChangeMulti` instead. */
  multi?: boolean;
  selectedValues?: string[];
  onChangeMulti?: (values: string[]) => void;
}

export function PillDropdown({
  label,
  icon,
  options,
  value,
  onChange,
  disabled = false,
  multi = false,
  selectedValues = [],
  onChangeMulti,
}: PillDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const selectedOption = options.find((o) => o.value === value);
  const displayLabel = multi
    ? selectedValues.length > 0
      ? `${label} (${selectedValues.length})`
      : label
    : selectedOption
      ? selectedOption.label
      : label;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
          disabled
            ? "cursor-not-allowed border-slate-800 text-slate-600"
            : open
              ? "border-slate-600 bg-slate-700 text-slate-200"
              : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-200"
        }`}
      >
        {icon && <span className="text-sm leading-none">{icon}</span>}
        {displayLabel}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[180px] max-h-[240px] overflow-y-auto rounded-lg border border-slate-700 bg-slate-800 py-1 shadow-xl">
          {options.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-500">No options</div>
          )}
          {options.map((opt) => {
            const isSelected = multi
              ? selectedValues.includes(opt.value)
              : value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                  isSelected
                    ? "bg-slate-700 text-white"
                    : "text-slate-300 hover:bg-slate-700/60 hover:text-slate-200"
                }`}
                onClick={() => {
                  if (multi && onChangeMulti) {
                    onChangeMulti(
                      isSelected
                        ? selectedValues.filter((v) => v !== opt.value)
                        : [...selectedValues, opt.value]
                    );
                  } else {
                    onChange(isSelected ? null : opt.value);
                    setOpen(false);
                  }
                }}
              >
                {opt.color && (
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: opt.color }}
                  />
                )}
                {opt.icon && <span className="text-sm leading-none">{opt.icon}</span>}
                {opt.label}
                {isSelected && !opt.color && (
                  <svg className="ml-auto h-3.5 w-3.5 shrink-0 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/components/tasks/pill-dropdown.tsx
git commit -m "feat(frontend): add PillDropdown reusable component

- Pill button that toggles an anchored dropdown with selectable options
- Supports single and multi-select modes
- Supports disabled state, icons, color dots
- Closes on outside click and Escape key"
```

---

### Task 2: Create the QuickCreateIssueModal component (shell + main fields)

Build the modal shell (backdrop, header, close behavior) and the title/description fields.

**Files:**
- Create: `frontend/components/tasks/quick-create-issue-modal.tsx`

**Step 1: Create the modal component**

```tsx
"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type {
  ProjectList,
  ProjectMember,
  Milestone,
  Cycle,
  Label,
  IssuePriority,
} from "@/types";
import { createIssue } from "@/lib/api/issues";
import { listProjectMembers } from "@/lib/api/projects";
import { listMilestones } from "@/lib/api/milestones";
import { listCycles } from "@/lib/api/cycles";
import { listLabels } from "@/lib/api/workspace";
import { PillDropdown } from "./pill-dropdown";

interface QuickCreateIssueModalProps {
  projects: ProjectList[];
  onClose: () => void;
  onCreated: () => void;
}

const PRIORITY_OPTIONS = [
  { value: "NONE", label: "None" },
  { value: "URGENT", label: "Urgent" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

export function QuickCreateIssueModal({
  projects,
  onClose,
  onCreated,
}: QuickCreateIssueModalProps) {
  // --- Form state ---
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [priority, setPriority] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [milestoneId, setMilestoneId] = useState<string | null>(null);
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [estimate, setEstimate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [showMore, setShowMore] = useState(false);

  // --- Project-dependent data ---
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);

  // --- UI state ---
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const descRef = useRef<HTMLTextAreaElement>(null);

  // --- Escape to close ---
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // --- Auto-resize description textarea ---
  const autoResize = useCallback(() => {
    const el = descRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    }
  }, []);

  // --- Fetch project-dependent data ---
  const fetchProjectData = useCallback(async (pid: string) => {
    const [membersRes, milestonesRes, cyclesRes, labelsRes] = await Promise.all([
      listProjectMembers(pid),
      listMilestones(pid),
      listCycles(pid),
      listLabels(),
    ]);
    setMembers(membersRes.results);
    setMilestones(milestonesRes.results);
    setCycles(cyclesRes.results);
    setLabels(labelsRes.results);
  }, []);

  // --- Handle project change ---
  const handleProjectChange = useCallback(
    (pid: string | null) => {
      setProjectId(pid);
      // Reset project-dependent fields
      setAssigneeId(null);
      setMilestoneId(null);
      setCycleId(null);
      setLabelIds([]);
      if (pid) {
        fetchProjectData(pid);
      } else {
        setMembers([]);
        setMilestones([]);
        setCycles([]);
        setLabels([]);
      }
    },
    [fetchProjectData]
  );

  // --- Submit ---
  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !projectId) return;
    setIsSubmitting(true);
    setError("");
    try {
      await createIssue(projectId, {
        title: title.trim(),
        description: description.trim() || undefined,
        status: "BACKLOG",
        priority: (priority as IssuePriority) || undefined,
        assignee_id: assigneeId || null,
        milestone_id: milestoneId || null,
        cycle_id: cycleId || null,
        label_ids: labelIds.length > 0 ? labelIds : undefined,
        estimate: estimate ? parseInt(estimate) : null,
        due_date: dueDate || null,
      });
      onCreated();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: Record<string, string[]> } };
      if (axiosErr.response?.data) {
        setError(Object.values(axiosErr.response.data).flat().join(" "));
      } else {
        setError("Failed to create issue.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    title, description, projectId, priority, assigneeId,
    milestoneId, cycleId, labelIds, estimate, dueDate, onCreated,
  ]);

  const selectedProject = projects.find((p) => p.id === projectId);
  const canSubmit = title.trim().length > 0 && !!projectId && !isSubmitting;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-xl border border-slate-800/60 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-slate-800/60 px-5 py-3">
          {selectedProject ? (
            <span className="flex items-center gap-1.5 rounded-md bg-slate-800 px-2 py-1 text-xs font-medium text-slate-300">
              {selectedProject.icon && (
                <span className="text-xs leading-none">{selectedProject.icon}</span>
              )}
              {selectedProject.name}
            </span>
          ) : (
            <span className="text-xs text-slate-500">Select project</span>
          )}
          <span className="text-xs text-slate-600">›</span>
          <span className="text-sm font-medium text-slate-200">New issue</span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {/* Title */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Issue title"
            autoFocus
            className="w-full border-0 bg-transparent text-lg font-semibold text-white placeholder-slate-600 outline-none"
          />

          {/* Description */}
          <textarea
            ref={descRef}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              autoResize();
            }}
            placeholder="Add description..."
            rows={3}
            className="mt-3 w-full resize-none border-0 bg-transparent text-sm text-slate-300 placeholder-slate-600 outline-none"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mb-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Pill bar */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-800/60 px-5 py-3">
          {/* Status — fixed Backlog */}
          <span className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-400">
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="8" r="3" />
            </svg>
            Backlog
          </span>

          {/* Priority */}
          <PillDropdown
            label="Priority"
            icon="—"
            options={PRIORITY_OPTIONS}
            value={priority}
            onChange={setPriority}
          />

          {/* Assignee */}
          <PillDropdown
            label="Assignee"
            options={members.map((m) => ({
              value: m.user.id,
              label: `${m.user.first_name} ${m.user.last_name}`.trim() || m.user.email,
            }))}
            value={assigneeId}
            onChange={setAssigneeId}
            disabled={!projectId}
          />

          {/* Project */}
          <PillDropdown
            label="Project"
            options={projects.map((p) => ({
              value: p.id,
              label: p.name,
              icon: p.icon ? <span>{p.icon}</span> : undefined,
            }))}
            value={projectId}
            onChange={handleProjectChange}
          />

          {/* Labels */}
          <PillDropdown
            label="Labels"
            options={labels.map((l) => ({
              value: l.id,
              label: l.name,
              color: l.color,
            }))}
            value={null}
            onChange={() => {}}
            multi
            selectedValues={labelIds}
            onChangeMulti={setLabelIds}
            disabled={!projectId}
          />

          {/* Expandable extras */}
          {!showMore ? (
            <button
              type="button"
              onClick={() => setShowMore(true)}
              className="flex items-center rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-300"
            >
              •••
            </button>
          ) : (
            <>
              {/* Milestone */}
              <PillDropdown
                label="Milestone"
                options={milestones.map((m) => ({
                  value: m.id,
                  label: m.name,
                }))}
                value={milestoneId}
                onChange={setMilestoneId}
                disabled={!projectId}
              />

              {/* Cycle */}
              <PillDropdown
                label="Cycle"
                options={cycles.map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
                value={cycleId}
                onChange={setCycleId}
                disabled={!projectId}
              />

              {/* Estimate */}
              <div className="flex items-center rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs">
                <input
                  type="number"
                  min="0"
                  value={estimate}
                  onChange={(e) => setEstimate(e.target.value)}
                  placeholder="Estimate"
                  className="w-16 border-0 bg-transparent text-xs text-slate-300 placeholder-slate-500 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </div>

              {/* Due date */}
              <div className="flex items-center rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="border-0 bg-transparent text-xs text-slate-300 outline-none [color-scheme:dark]"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-slate-800/60 px-5 py-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Creating..." : "Create issue"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/components/tasks/quick-create-issue-modal.tsx
git commit -m "feat(frontend): add QuickCreateIssueModal component

- Linear-style modal with inline title/description inputs
- Pill bar with Status (fixed Backlog), Priority, Assignee, Project, Labels
- Expandable extras: Milestone, Cycle, Estimate, Due date via '...' pill
- Dynamic data fetching when project is selected
- Resets dependent fields on project change
- Escape, backdrop click, and X button to close"
```

---

### Task 3: Integrate the modal into the Tasks page

Wire the button and modal into `frontend/app/(dashboard)/tasks/page.tsx`.

**Files:**
- Modify: `frontend/app/(dashboard)/tasks/page.tsx`

**Step 1: Add import**

At line 7, add the import for `QuickCreateIssueModal`:

```tsx
import { QuickCreateIssueModal } from "@/components/tasks/quick-create-issue-modal";
```

**Step 2: Add state for modal visibility**

Inside `TasksPage()`, after the `selectedIssue` state (line 22), add:

```tsx
const [showCreateModal, setShowCreateModal] = useState(false);
```

**Step 3: Add button in filter bar**

Replace the filters `<div>` (lines 66-102) — add `ml-auto` button after the two `<Select>` components:

```tsx
      {/* Filters */}
      <div className="mt-4 flex items-center gap-3">
        {/* Project filter */}
        <Select
          options={[
            { value: "", label: "All Projects" },
            ...projects.map((p) => ({ value: p.id, label: p.name })),
          ]}
          value={filters.project_id || ""}
          onChange={(v) =>
            setFilters((f) => ({
              ...f,
              project_id: v || undefined,
            }))
          }
          placeholder="All Projects"
        />

        {/* Priority filter */}
        <Select
          options={[
            { value: "", label: "All Priorities" },
            { value: "URGENT", label: "Urgent" },
            { value: "HIGH", label: "High" },
            { value: "MEDIUM", label: "Medium" },
            { value: "LOW", label: "Low" },
            { value: "NONE", label: "None" },
          ]}
          value={filters.priority || ""}
          onChange={(v) =>
            setFilters((f) => ({
              ...f,
              priority: (v as IssuePriority) || undefined,
            }))
          }
          placeholder="All Priorities"
        />

        <button
          onClick={() => setShowCreateModal(true)}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Create issue
        </button>
      </div>
```

**Step 4: Render the modal**

After the `IssueSidePanel` block (after line 128), add:

```tsx
      {/* Quick create modal */}
      {showCreateModal && (
        <QuickCreateIssueModal
          projects={projects}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            fetchIssues();
          }}
        />
      )}
```

**Step 5: Commit**

```bash
git add frontend/app/\(dashboard\)/tasks/page.tsx
git commit -m "feat(frontend): add Create Issue button and modal to Tasks page

- Add indigo 'Create issue' button in filter bar (right-aligned)
- Wire QuickCreateIssueModal with projects list
- Refresh issues on successful creation"
```

---

### Task 4: Verify the build

**Step 1: Run the frontend lint**

```bash
make lint-frontend
```

Expected: No errors.

**Step 2: Run the frontend build**

```bash
docker compose exec frontend ./node_modules/.bin/next build
```

Expected: Build succeeds with no TypeScript errors.

**Step 3: Manual smoke test**

1. Navigate to `/tasks`
2. Verify "Create issue" button appears right-aligned in filter bar
3. Click the button — modal opens
4. Verify title input is auto-focused
5. Verify Backlog pill is static/non-interactive
6. Select a project → verify Assignee, Labels pills become enabled
7. Click "..." → verify Milestone, Cycle, Estimate, Due date pills expand
8. Fill title + select project → click "Create issue" → verify issue appears on board in Backlog column
9. Verify Escape, backdrop click, and X all close the modal
10. Change project → verify assignee/labels/milestone/cycle reset
