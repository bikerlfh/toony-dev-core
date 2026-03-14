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
  const [expanded, setExpanded] = useState(false);

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
      <div className={`flex w-full flex-col rounded-xl border border-slate-800/60 bg-slate-900 shadow-2xl transition-all duration-200 ${expanded ? "max-w-5xl max-h-[90vh]" : "max-w-3xl"}`}>
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
          <div className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
              title={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 9L4 4m0 0v4m0-4h4m6 6l5 5m0 0v-4m0 4h-4" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 3h6m0 0v6m0-6L14 10M9 21H3m0 0v-6m0 6l7-7" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className={`px-5 py-4 ${expanded ? "flex-1 overflow-y-auto" : ""}`}>
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
            rows={expanded ? 12 : 3}
            className={`mt-3 w-full resize-none border-0 bg-transparent text-sm text-slate-300 placeholder-slate-600 outline-none ${expanded ? "flex-1" : ""}`}
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
            renderLabel={(selected, opts) => {
              if (selected.length === 0) return "Labels";
              if (selected.length === 1) {
                const lbl = opts.find((o) => o.value === selected[0]);
                if (!lbl) return "Labels";
                return (
                  <span className="flex items-center gap-1">
                    <span
                      className="inline-block h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: lbl.color }}
                    />
                    {lbl.label}
                  </span>
                );
              }
              return `${selected.length} labels`;
            }}
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
