"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useOrg } from "@/contexts/org-context";
import {
  getOrganizationSettings,
  updateOrganizationSettings,
} from "@/lib/api/settings";
import { deleteOrganization } from "@/lib/api/organizations";
import { canEditOrg, canDeleteOrg } from "@/lib/roles";
import { ConfirmModal } from "@/components/confirm-modal";
import type { MethodologyChoice, OrganizationSettings } from "@/types";

const METHODOLOGY_OPTIONS: { value: MethodologyChoice; label: string }[] = [
  { value: "SCRUM", label: "Scrum" },
  { value: "KANBAN", label: "Kanban" },
  { value: "CUSTOM", label: "Custom" },
];

export default function SettingsPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = params.orgSlug as string;
  const { currentMembership, refreshOrganizations } = useOrg();

  const [settings, setSettings] = useState<OrganizationSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [methodology, setMethodology] = useState<MethodologyChoice>("SCRUM");
  const [timezone, setTimezone] = useState("UTC");
  const [auditRetentionDays, setAuditRetentionDays] = useState(90);

  const canEdit = canEditOrg(currentMembership?.role);
  const canDelete = canDeleteOrg(currentMembership?.role);

  const fetchSettings = useCallback(async () => {
    try {
      const data = await getOrganizationSettings(orgSlug);
      setSettings(data);
      setMethodology(data.default_project_methodology);
      setTimezone(data.timezone);
      setAuditRetentionDays(data.audit_log_retention_days);
    } finally {
      setIsLoading(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaveMessage("");
    setIsSaving(true);

    try {
      const updated = await updateOrganizationSettings(orgSlug, {
        default_project_methodology: methodology,
        timezone,
        audit_log_retention_days: auditRetentionDays,
      });
      setSettings(updated);
      setSaveMessage("Settings saved.");
    } catch {
      setSaveMessage("Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await deleteOrganization(orgSlug);
      await refreshOrganizations();
      router.push("/");
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return <p className="text-gray-500">Loading settings...</p>;
  }

  if (!settings) {
    return <p className="text-red-500">Failed to load settings.</p>;
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      <form onSubmit={handleSave} className="mt-6 space-y-6">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-medium text-gray-900">General</h2>

          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Default methodology
              </label>
              <select
                value={methodology}
                onChange={(e) =>
                  setMethodology(e.target.value as MethodologyChoice)
                }
                disabled={!canEdit}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-gray-100"
              >
                {METHODOLOGY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Timezone
              </label>
              <input
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                disabled={!canEdit}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Audit log retention (days)
              </label>
              <input
                type="number"
                min={1}
                value={auditRetentionDays}
                onChange={(e) =>
                  setAuditRetentionDays(parseInt(e.target.value) || 1)
                }
                disabled={!canEdit}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-gray-100"
              />
            </div>
          </div>

          {canEdit && (
            <div className="mt-6">
              {saveMessage && (
                <p
                  className={`mb-3 text-sm ${
                    saveMessage.includes("Failed")
                      ? "text-red-600"
                      : "text-green-600"
                  }`}
                >
                  {saveMessage}
                </p>
              )}
              <button
                type="submit"
                disabled={isSaving}
                className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save settings"}
              </button>
            </div>
          )}
        </div>
      </form>

      {canDelete && (
        <div className="mt-8 rounded-lg border border-red-200 bg-white p-6">
          <h2 className="text-lg font-medium text-red-900">Danger zone</h2>
          <p className="mt-1 text-sm text-gray-600">
            Permanently delete this organization and all its data.
          </p>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="mt-4 rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
          >
            Delete organization
          </button>
        </div>
      )}

      {showDeleteConfirm && (
        <ConfirmModal
          title="Delete organization"
          message="This action cannot be undone. All data will be permanently deleted."
          confirmLabel="Delete"
          confirmVariant="danger"
          isLoading={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
