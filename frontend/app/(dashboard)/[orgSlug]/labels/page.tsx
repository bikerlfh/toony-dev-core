"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useOrg } from "@/contexts/org-context";
import { listLabels, createLabel, updateLabel, deleteLabel } from "@/lib/api/labels";
import { canManageLabels } from "@/lib/roles";
import { ConfirmModal } from "@/components/confirm-modal";
import type { Label } from "@/types";

const DEFAULT_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280", "#1e293b",
];

export default function LabelsPage() {
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const { currentMembership } = useOrg();

  const [labels, setLabels] = useState<Label[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Label | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Label | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const canManage = canManageLabels(currentMembership?.role);

  const fetchLabels = useCallback(async () => {
    try {
      setLabels((await listLabels(orgSlug)).results);
    } finally {
      setIsLoading(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    fetchLabels();
  }, [fetchLabels]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteLabel(orgSlug, deleteTarget.id);
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
        <h1 className="text-2xl font-medium tracking-tight text-white">Labels</h1>
        {canManage && (
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            Create label
          </button>
        )}
      </div>

      {labels.length === 0 ? (
        <p className="mt-6 text-slate-500">No labels yet.</p>
      ) : (
        <div className="mt-6 space-y-2">
          {labels.map((label) => (
            <div
              key={label.id}
              className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-900 px-5 py-3"
            >
              <div className="flex items-center gap-3">
                <span
                  className="inline-block h-4 w-4 rounded-full"
                  style={{ backgroundColor: label.color }}
                />
                <span className="font-medium text-slate-200">{label.name}</span>
                {label.description && (
                  <span className="text-sm text-slate-500">{label.description}</span>
                )}
              </div>
              {canManage && (
                <div className="flex gap-3">
                  <button
                    onClick={() => setEditTarget(label)}
                    className="text-sm text-indigo-400 transition-colors hover:text-indigo-300"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteTarget(label)}
                    className="text-sm text-red-400 transition-colors hover:text-red-300"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <LabelFormModal orgSlug={orgSlug} onClose={() => setShowCreate(false)} onSaved={fetchLabels} />
      )}

      {editTarget && (
        <LabelFormModal orgSlug={orgSlug} label={editTarget} onClose={() => setEditTarget(null)} onSaved={fetchLabels} />
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

// --- Label Form Modal (create & edit) ---

const LABEL_INPUT_CLASS =
  "mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors";

function LabelFormModal({
  orgSlug,
  label,
  onClose,
  onSaved,
}: {
  orgSlug: string;
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
        await updateLabel(orgSlug, label.id, { name, color, description });
      } else {
        await createLabel(orgSlug, { name, color, description });
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
