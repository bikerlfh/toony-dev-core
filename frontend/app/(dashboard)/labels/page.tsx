"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { listLabels, createLabel, updateLabel, deleteLabel } from "@/lib/api/workspace";
// Role checks removed — will be re-implemented when org context is rebuilt
import { ConfirmModal } from "@/components/confirm-modal";
import type { Label } from "@/types";

const DEFAULT_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280", "#1e293b",
];

export default function LabelsPage() {
  const [labels, setLabels] = useState<Label[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Label | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Label | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Role checks temporarily set to true — will be re-implemented when org context is rebuilt
  const canManage = true;

  const fetchLabels = useCallback(async () => {
    try {
      setLabels((await listLabels()).results);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLabels();
  }, [fetchLabels]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteLabel(deleteTarget.id);
      setDeleteTarget(null);
      fetchLabels();
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return <p className="text-slate-500">Loading labels...</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-medium tracking-tight text-white">Labels</h1>
          {labels.length > 0 && (
            <span className="text-sm text-slate-600">{labels.length}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {canManage && (
            <button
              onClick={() => setShowCreate(true)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
            >
              Create label
            </button>
          )}
        </div>
      </div>

      {labels.length === 0 ? (
        <p className="mt-6 text-slate-500">No labels yet.</p>
      ) : (
        <ChipView
          labels={labels}
          canManage={canManage}
          onEdit={setEditTarget}
          onDelete={setDeleteTarget}
          onCreateClick={() => setShowCreate(true)}
        />
      )}

      {showCreate && (
        <LabelFormModal onClose={() => setShowCreate(false)} onSaved={fetchLabels} />
      )}

      {editTarget && (
        <LabelFormModal label={editTarget} onClose={() => setEditTarget(null)} onSaved={fetchLabels} />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete label"
          message={`Delete label "${deleteTarget.name}"? It will be removed from all issues.`}
          confirmLabel="Delete"
          confirmVariant="danger"
          isLoading={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// --- Chip Wall (flowing pills) ---

function ChipView({
  labels,
  canManage,
  onEdit,
  onDelete,
  onCreateClick,
}: {
  labels: Label[];
  canManage: boolean;
  onEdit: (label: Label) => void;
  onDelete: (label: Label) => void;
  onCreateClick: () => void;
}) {
  return (
    <div className="mt-6 flex flex-wrap gap-3">
      {labels.map((label) => (
        <div key={label.id} className="group relative">
          <button
            onClick={() => canManage && onEdit(label)}
            className="inline-flex items-center gap-2.5 rounded-full px-5 py-2.5 text-sm font-medium transition-all hover:brightness-125"
            style={{
              backgroundColor: `${label.color}1a`,
              color: label.color,
              border: `1px solid ${label.color}30`,
            }}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: label.color }}
            />
            {label.name}
          </button>

          {/* Small delete badge on hover */}
          {canManage && (
            <button
              onClick={() => onDelete(label)}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-slate-500 opacity-0 transition-all group-hover:opacity-100 hover:border-red-500/30 hover:bg-red-500/20 hover:text-red-400"
              title="Delete"
            >
              <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M3 3l6 6M9 3l-6 6" />
              </svg>
            </button>
          )}
        </div>
      ))}

      {/* "Add label" chip */}
      {canManage && (
        <button
          onClick={onCreateClick}
          className="inline-flex items-center gap-2 rounded-full border border-dashed border-slate-700 px-5 py-2.5 text-sm text-slate-600 transition-colors hover:border-slate-500 hover:text-slate-400"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M8 3v10M3 8h10" />
          </svg>
          Add label
        </button>
      )}
    </div>
  );
}

// --- Label Form Modal (create & edit) ---

const LABEL_INPUT_CLASS =
  "mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors";

function LabelFormModal({
  label,
  onClose,
  onSaved,
}: {
  label?: Label;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!label;
  const [name, setName] = useState(label?.name || "");
  const [color, setColor] = useState(label?.color || DEFAULT_COLORS[0]);
  const [description, setDescription] = useState(label?.description || "");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      if (isEdit && label) {
        await updateLabel(label.id, { name, color, description });
      } else {
        await createLabel({ name, color, description });
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })
        ?.response?.data;
      if (data) {
        setError(Object.values(data).flat().join(" "));
      } else {
        setError(isEdit ? "Failed to update label." : "Failed to create label.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-xl border border-slate-800/60 bg-slate-900 p-6">
        <h2 className="mb-4 text-base font-medium tracking-tight text-white">
          {isEdit ? "Edit label" : "Create label"}
        </h2>

        {/* Live preview */}
        <div className="mb-5 flex items-center justify-center rounded-lg border border-slate-800/40 bg-slate-950/50 py-4">
          <span
            className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
            style={{
              backgroundColor: `${color}1a`,
              color: color,
            }}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: color }}
            />
            {name || "Label preview"}
          </span>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
            <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6.25" /><path d="M8 5v3.5M8 10.5h.007" strokeLinecap="round" /></svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400">Name</label>
            <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={LABEL_INPUT_CLASS} placeholder="Bug" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400">Color</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {DEFAULT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full border-2 transition-transform ${
                    color === c ? "border-white scale-110" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-8 w-8 cursor-pointer rounded border border-slate-700 bg-slate-950"
              />
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                maxLength={7}
                className="w-24 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-sm text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400">
              Description <span className="text-slate-600">(optional)</span>
            </label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className={LABEL_INPUT_CLASS} />
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-600">esc to cancel</span>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50">
                {isSubmitting ? (isEdit ? "Saving..." : "Creating...") : (isEdit ? "Save label" : "Create label")}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
