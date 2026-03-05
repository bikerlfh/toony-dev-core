"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getOrganization, updateOrganization } from "@/lib/api/organizations";
import { listMembers, addMember, updateMemberRole, removeMember } from "@/lib/api/members";
import { getOrganizationSettings, updateOrganizationSettings } from "@/lib/api/settings";
import { listCredentials, createCredential, deleteCredential } from "@/lib/api/credentials";
import { listIntegrations, createIntegration, deleteIntegration } from "@/lib/api/integrations";
import { listImportJobs } from "@/lib/api/imports";
import { Select } from "@/components/ui/select";
import { ConfirmModal } from "@/components/confirm-modal";
import type {
  OrganizationDetail,
  Member,
  MembershipRole,
  OrganizationSettings,
  MethodologyChoice,
  RepositoryCredential,
  CredentialProvider,
  CredentialType,
  IntegrationConfig,
  IntegrationProvider,
  ImportJob,
} from "@/types";

type Tab = "general" | "members" | "settings" | "credentials" | "integrations" | "imports";

const TABS: { key: Tab; label: string }[] = [
  { key: "general", label: "General" },
  { key: "members", label: "Members" },
  { key: "settings", label: "Settings" },
  { key: "credentials", label: "Credentials" },
  { key: "integrations", label: "Integrations" },
  { key: "imports", label: "Imports" },
];

const MEMBERSHIP_ROLES: { value: MembershipRole; label: string }[] = [
  { value: "OWNER", label: "Owner" },
  { value: "ADMIN", label: "Admin" },
  { value: "MANAGER", label: "Manager" },
  { value: "MEMBER", label: "Member" },
  { value: "VIEWER", label: "Viewer" },
];

const ROLE_COLORS: Record<MembershipRole, string> = {
  OWNER: "bg-purple-500/15 text-purple-400",
  ADMIN: "bg-red-500/15 text-red-400",
  MANAGER: "bg-amber-500/15 text-amber-400",
  MEMBER: "bg-blue-500/15 text-blue-400",
  VIEWER: "bg-slate-700 text-slate-400",
};

const METHODOLOGY_OPTIONS: { value: MethodologyChoice; label: string }[] = [
  { value: "SCRUM", label: "Scrum" },
  { value: "KANBAN", label: "Kanban" },
  { value: "CUSTOM", label: "Custom" },
];

const CREDENTIAL_PROVIDER_OPTIONS: { value: CredentialProvider; label: string }[] = [
  { value: "GITHUB", label: "GitHub" },
  { value: "GITLAB", label: "GitLab" },
  { value: "BITBUCKET", label: "Bitbucket" },
  { value: "CUSTOM", label: "Custom" },
];

const CREDENTIAL_TYPE_OPTIONS: { value: CredentialType; label: string }[] = [
  { value: "TOKEN", label: "Token" },
  { value: "SSH_KEY", label: "SSH Key" },
  { value: "APP_CREDENTIAL", label: "App Credential" },
];

const INTEGRATION_PROVIDER_OPTIONS: { value: IntegrationProvider; label: string }[] = [
  { value: "LINEAR", label: "Linear" },
  { value: "JIRA", label: "Jira" },
  { value: "TRELLO", label: "Trello" },
  { value: "SLACK", label: "Slack" },
  { value: "CUSTOM", label: "Custom" },
];

const INPUT_CLASS =
  "mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors";

const IMPORT_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-slate-700 text-slate-400",
  IN_PROGRESS: "bg-amber-500/15 text-amber-400",
  COMPLETED: "bg-emerald-500/15 text-emerald-400",
  FAILED: "bg-red-500/15 text-red-400",
  PARTIALLY_COMPLETED: "bg-orange-500/15 text-orange-400",
};

// ────────────────────────────── General Tab ──────────────────────────────

function GeneralTab({
  org,
  orgId,
  onUpdated,
}: {
  org: OrganizationDetail;
  orgId: string;
  onUpdated: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(org.name);
  const [description, setDescription] = useState(org.description || "");
  const [website, setWebsite] = useState(org.website || "");
  const [industry, setIndustry] = useState(org.industry || "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [showStatusConfirm, setShowStatusConfirm] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  useEffect(() => {
    setName(org.name);
    setDescription(org.description || "");
    setWebsite(org.website || "");
    setIndustry(org.industry || "");
  }, [org]);

  async function handleSave() {
    setError("");
    setIsSaving(true);
    try {
      await updateOrganization(orgId, { name, description, website, industry });
      setIsEditing(false);
      onUpdated();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })?.response?.data;
      setError(data ? Object.values(data).flat().join(" ") : "Failed to update.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleStatus() {
    setIsTogglingStatus(true);
    try {
      await updateOrganization(orgId, { is_active: !org.is_active });
      setShowStatusConfirm(false);
      onUpdated();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })?.response?.data;
      setError(data ? Object.values(data).flat().join(" ") : "Failed to update status.");
    } finally {
      setIsTogglingStatus(false);
    }
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  // ── Edit mode ──
  if (isEditing) {
    return (
      <div className="max-w-2xl space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium text-white">Edit organization</h3>
          <button
            onClick={() => setIsEditing(false)}
            className="text-sm text-slate-500 transition-colors hover:text-slate-300"
          >
            Cancel
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
            <span>{error}</span>
          </div>
        )}

        <div className="rounded-xl border border-slate-800/60 bg-slate-900 p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLASS} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={`${INPUT_CLASS} resize-none`} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400">Website</label>
              <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" className={INPUT_CLASS} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400">Industry</label>
              <input type="text" value={industry} onChange={(e) => setIndustry(e.target.value)} className={INPUT_CLASS} />
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save changes"}
          </button>
          <button
            onClick={() => setIsEditing(false)}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-slate-600"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── View mode ──
  return (
    <div className="max-w-2xl space-y-6">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
          <span>{error}</span>
        </div>
      )}

      {/* ── Identity card ── */}
      <div className="rounded-xl border border-slate-800/60 bg-slate-900 p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-800/60 text-lg font-semibold text-slate-400">
              {org.name[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h3 className="truncate text-lg font-medium text-white">{org.name}</h3>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    org.is_active
                      ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                      : "border border-slate-700 bg-slate-800 text-slate-500"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      org.is_active ? "bg-emerald-400" : "bg-slate-600"
                    }`}
                  />
                  {org.is_active ? "Active" : "Inactive"}
                </span>
              </div>
              <span className="mt-1 inline-block font-mono text-sm text-slate-500">{org.slug}</span>
              {org.description && (
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{org.description}</p>
              )}
            </div>
          </div>
          <button
            onClick={() => setIsEditing(true)}
            className="shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-600 hover:text-white"
          >
            Edit
          </button>
        </div>
      </div>

      {/* ── Details bento grid ── */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-800/60 bg-slate-800/30">
        <div className="bg-slate-950 p-5">
          <dt className="text-xs font-medium uppercase tracking-wider text-slate-600">Website</dt>
          <dd className="mt-2 text-sm text-slate-200">
            {org.website ? (
              <a
                href={org.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 transition-colors hover:text-indigo-300"
              >
                {org.website.replace(/^https?:\/\//, "")}
              </a>
            ) : (
              <span className="text-slate-600">Not set</span>
            )}
          </dd>
        </div>
        <div className="bg-slate-950 p-5">
          <dt className="text-xs font-medium uppercase tracking-wider text-slate-600">Industry</dt>
          <dd className="mt-2 text-sm text-slate-200">
            {org.industry || <span className="text-slate-600">Not set</span>}
          </dd>
        </div>
        <div className="bg-slate-950 p-5">
          <dt className="text-xs font-medium uppercase tracking-wider text-slate-600">Created</dt>
          <dd className="mt-2 text-sm text-slate-400">{fmtDate(org.created_at)}</dd>
        </div>
        <div className="bg-slate-950 p-5">
          <dt className="text-xs font-medium uppercase tracking-wider text-slate-600">Last updated</dt>
          <dd className="mt-2 text-sm text-slate-400">{fmtDate(org.updated_at)}</dd>
        </div>
      </div>

      {/* ── Status control ── */}
      <div className="rounded-xl border border-slate-800/60 bg-slate-900 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-white">Organization status</h4>
            <p className="mt-1 text-sm text-slate-500">
              {org.is_active
                ? "This organization is active and fully operational."
                : "This organization is deactivated. Members cannot access its resources."}
            </p>
          </div>
          <button
            onClick={() => {
              if (org.is_active) {
                setShowStatusConfirm(true);
              } else {
                handleToggleStatus();
              }
            }}
            disabled={isTogglingStatus}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
              org.is_active
                ? "border border-red-500/30 text-red-400 hover:bg-red-500/10"
                : "bg-emerald-600 text-white hover:bg-emerald-500"
            }`}
          >
            {isTogglingStatus
              ? org.is_active ? "Deactivating..." : "Activating..."
              : org.is_active ? "Deactivate" : "Activate"}
          </button>
        </div>
      </div>

      {showStatusConfirm && (
        <ConfirmModal
          title="Deactivate organization"
          message={`Deactivate "${org.name}"? Members will lose access to all resources under this organization. You can reactivate it later.`}
          confirmLabel="Deactivate"
          confirmVariant="danger"
          isLoading={isTogglingStatus}
          onConfirm={handleToggleStatus}
          onCancel={() => setShowStatusConfirm(false)}
        />
      )}
    </div>
  );
}

// ────────────────────────────── Members Tab ──────────────────────────────

function MembersTab({ orgId }: { orgId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MembershipRole>("MEMBER");
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState("");
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await listMembers(orgId);
      setMembers(res.results);
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  async function handleAddMember(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError("");
    setIsAdding(true);
    try {
      await addMember(orgId, { email, role });
      setEmail("");
      setRole("MEMBER");
      fetchMembers();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })?.response?.data;
      setError(data ? Object.values(data).flat().join(" ") : "Failed to add member.");
    } finally {
      setIsAdding(false);
    }
  }

  async function handleRoleChange(userId: string, newRole: MembershipRole) {
    try {
      await updateMemberRole(orgId, userId, { role: newRole });
      fetchMembers();
    } catch {
      // silently fail for now
    }
  }

  async function handleRemove() {
    if (!removeTarget) return;
    setIsRemoving(true);
    try {
      await removeMember(orgId, removeTarget.user.id);
      setRemoveTarget(null);
      fetchMembers();
    } finally {
      setIsRemoving(false);
    }
  }

  if (isLoading) return <p className="text-slate-500">Loading members...</p>;

  return (
    <div>
      {/* Add member form */}
      <form onSubmit={handleAddMember} className="mb-6 flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-sm font-medium text-slate-400">Add member by email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            className={INPUT_CLASS}
          />
        </div>
        <div className="w-36">
          <label className="block text-sm font-medium text-slate-400">Role</label>
          <Select
            options={MEMBERSHIP_ROLES.filter((r) => r.value !== "OWNER")}
            value={role}
            onChange={(v) => setRole(v as MembershipRole)}
            className="mt-1.5"
          />
        </div>
        <button
          type="submit"
          disabled={isAdding}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
        >
          {isAdding ? "Adding..." : "Add"}
        </button>
      </form>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
          <span>{error}</span>
        </div>
      )}

      {/* Members list */}
      <div className="space-y-2">
        {members.map((member) => (
          <div
            key={member.id}
            className="flex items-center justify-between rounded-lg border border-slate-800/60 bg-slate-900 px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-sm font-medium text-slate-300">
                {member.user.first_name?.[0]?.toUpperCase() || member.user.email[0].toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-slate-200">
                  {member.user.first_name} {member.user.last_name}
                </p>
                <p className="text-xs text-slate-500">{member.user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {member.role === "OWNER" ? (
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_COLORS[member.role]}`}>
                  {member.role}
                </span>
              ) : (
                <Select
                  options={MEMBERSHIP_ROLES.filter((r) => r.value !== "OWNER")}
                  value={member.role}
                  onChange={(v) => handleRoleChange(member.user.id, v as MembershipRole)}
                  size="sm"
                />
              )}
              {member.role !== "OWNER" && (
                <button
                  onClick={() => setRemoveTarget(member)}
                  className="text-xs text-red-400 transition-colors hover:text-red-300"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {removeTarget && (
        <ConfirmModal
          title="Remove member"
          message={`Remove ${removeTarget.user.first_name} ${removeTarget.user.last_name} from this organization?`}
          confirmLabel="Remove"
          confirmVariant="danger"
          isLoading={isRemoving}
          onConfirm={handleRemove}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
    </div>
  );
}

// ────────────────────────────── Settings Tab ──────────────────────────────

function SettingsTab({ orgId }: { orgId: string }) {
  const [settings, setSettings] = useState<OrganizationSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [methodology, setMethodology] = useState<MethodologyChoice>("SCRUM");
  const [timezone, setTimezone] = useState("UTC");
  const [auditRetention, setAuditRetention] = useState(90);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const data = await getOrganizationSettings(orgId);
      setSettings(data);
      setMethodology(data.default_project_methodology);
      setTimezone(data.timezone);
      setAuditRetention(data.audit_log_retention_days);
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    setIsSaving(true);
    try {
      await updateOrganizationSettings(orgId, {
        default_project_methodology: methodology,
        timezone,
        audit_log_retention_days: auditRetention,
      });
      setSuccess(true);
      fetchSettings();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })?.response?.data;
      setError(data ? Object.values(data).flat().join(" ") : "Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <p className="text-slate-500">Loading settings...</p>;
  if (!settings) return <p className="text-slate-500">Failed to load settings.</p>;

  return (
    <form onSubmit={handleSave} className="max-w-xl space-y-5">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-400">
          <span>Settings saved successfully.</span>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-400">Default Methodology</label>
        <Select
          options={METHODOLOGY_OPTIONS}
          value={methodology}
          onChange={(v) => setMethodology(v as MethodologyChoice)}
          className="mt-1.5"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-400">Timezone</label>
        <input
          type="text"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          placeholder="e.g. America/New_York"
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-400">Audit Log Retention (days)</label>
        <input
          type="number"
          min={1}
          value={auditRetention}
          onChange={(e) => setAuditRetention(parseInt(e.target.value) || 90)}
          className={INPUT_CLASS}
        />
      </div>

      <button
        type="submit"
        disabled={isSaving}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
      >
        {isSaving ? "Saving..." : "Save settings"}
      </button>
    </form>
  );
}

// ────────────────────────────── Credentials Tab ──────────────────────────────

function CredentialsTab({ orgId }: { orgId: string }) {
  const [credentials, setCredentials] = useState<RepositoryCredential[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [credName, setCredName] = useState("");
  const [provider, setProvider] = useState<CredentialProvider>("GITHUB");
  const [credType, setCredType] = useState<CredentialType>("TOKEN");
  const [credValue, setCredValue] = useState("");
  const [urlPattern, setUrlPattern] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<RepositoryCredential | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchCredentials = useCallback(async () => {
    try {
      const res = await listCredentials(orgId);
      setCredentials(res.results);
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!credName.trim() || !credValue.trim()) return;
    setError("");
    setIsSubmitting(true);
    try {
      await createCredential(orgId, {
        name: credName,
        provider,
        credential_type: credType,
        encrypted_value: credValue,
        url_pattern: urlPattern || undefined,
      });
      setCredName("");
      setCredValue("");
      setUrlPattern("");
      setShowForm(false);
      fetchCredentials();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })?.response?.data;
      setError(data ? Object.values(data).flat().join(" ") : "Failed to create credential.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteCredential(orgId, deleteTarget.id);
      setDeleteTarget(null);
      fetchCredentials();
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) return <p className="text-slate-500">Loading credentials...</p>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-medium text-white">Repository Credentials</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          {showForm ? "Cancel" : "Add credential"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 rounded-xl border border-slate-800/60 bg-slate-900 p-4 space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
              <span>{error}</span>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-400">Name</label>
            <input type="text" required value={credName} onChange={(e) => setCredName(e.target.value)} placeholder="My GitHub Token" className={INPUT_CLASS} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400">Provider</label>
              <Select options={CREDENTIAL_PROVIDER_OPTIONS} value={provider} onChange={(v) => setProvider(v as CredentialProvider)} className="mt-1.5" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400">Type</label>
              <Select options={CREDENTIAL_TYPE_OPTIONS} value={credType} onChange={(v) => setCredType(v as CredentialType)} className="mt-1.5" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400">Value / Token</label>
            <input type="password" required value={credValue} onChange={(e) => setCredValue(e.target.value)} placeholder="ghp_..." className={INPUT_CLASS} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400">URL Pattern (optional)</label>
            <input type="text" value={urlPattern} onChange={(e) => setUrlPattern(e.target.value)} placeholder="github.com/*" className={INPUT_CLASS} />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {isSubmitting ? "Creating..." : "Create credential"}
          </button>
        </form>
      )}

      {credentials.length === 0 && !showForm ? (
        <p className="text-slate-500">No credentials configured.</p>
      ) : (
        <div className="space-y-2">
          {credentials.map((cred) => (
            <div
              key={cred.id}
              className="flex items-center justify-between rounded-lg border border-slate-800/60 bg-slate-900 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-slate-200">{cred.name}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-400">{cred.provider}</span>
                  <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-400">{cred.credential_type}</span>
                  {!cred.is_active && (
                    <span className="rounded-md bg-red-500/15 px-2 py-0.5 text-xs text-red-400">Inactive</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setDeleteTarget(cred)}
                className="text-xs text-red-400 transition-colors hover:text-red-300"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete credential"
          message={`Delete credential "${deleteTarget.name}"? This cannot be undone.`}
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

// ────────────────────────────── Integrations Tab ──────────────────────────────

function IntegrationsTab({ orgId }: { orgId: string }) {
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [intProvider, setIntProvider] = useState<IntegrationProvider>("LINEAR");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [encryptedCreds, setEncryptedCreds] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<IntegrationConfig | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchIntegrations = useCallback(async () => {
    try {
      const res = await listIntegrations(orgId);
      setIntegrations(res.results);
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!encryptedCreds.trim()) return;
    setError("");
    setIsSubmitting(true);
    try {
      await createIntegration(orgId, {
        provider: intProvider,
        encrypted_credentials: encryptedCreds,
        webhook_url: webhookUrl || undefined,
      });
      setEncryptedCreds("");
      setWebhookUrl("");
      setShowForm(false);
      fetchIntegrations();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })?.response?.data;
      setError(data ? Object.values(data).flat().join(" ") : "Failed to create integration.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteIntegration(orgId, deleteTarget.id);
      setDeleteTarget(null);
      fetchIntegrations();
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) return <p className="text-slate-500">Loading integrations...</p>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-medium text-white">Integrations</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          {showForm ? "Cancel" : "Add integration"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 rounded-xl border border-slate-800/60 bg-slate-900 p-4 space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
              <span>{error}</span>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-400">Provider</label>
            <Select options={INTEGRATION_PROVIDER_OPTIONS} value={intProvider} onChange={(v) => setIntProvider(v as IntegrationProvider)} className="mt-1.5" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400">Credentials / API Key</label>
            <input type="password" required value={encryptedCreds} onChange={(e) => setEncryptedCreds(e.target.value)} placeholder="API key or token" className={INPUT_CLASS} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400">Webhook URL (optional)</label>
            <input type="url" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://hooks.example.com/..." className={INPUT_CLASS} />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {isSubmitting ? "Creating..." : "Create integration"}
          </button>
        </form>
      )}

      {integrations.length === 0 && !showForm ? (
        <p className="text-slate-500">No integrations configured.</p>
      ) : (
        <div className="space-y-2">
          {integrations.map((integ) => (
            <div
              key={integ.id}
              className="flex items-center justify-between rounded-lg border border-slate-800/60 bg-slate-900 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-slate-200">{integ.provider}</p>
                <div className="mt-1 flex items-center gap-2">
                  {integ.webhook_url && (
                    <span className="truncate text-xs text-slate-500">{integ.webhook_url}</span>
                  )}
                  {!integ.is_active && (
                    <span className="rounded-md bg-red-500/15 px-2 py-0.5 text-xs text-red-400">Inactive</span>
                  )}
                  {integ.is_active && (
                    <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">Active</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setDeleteTarget(integ)}
                className="text-xs text-red-400 transition-colors hover:text-red-300"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete integration"
          message={`Delete ${deleteTarget.provider} integration? This cannot be undone.`}
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

// ────────────────────────────── Imports Tab ──────────────────────────────

function ImportsTab({ orgId }: { orgId: string }) {
  const [imports, setImports] = useState<ImportJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchImports = useCallback(async () => {
    try {
      const res = await listImportJobs(orgId);
      setImports(res.results);
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchImports();
  }, [fetchImports]);

  if (isLoading) return <p className="text-slate-500">Loading imports...</p>;

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-base font-medium text-white">Import History</h3>
        <p className="mt-1 text-sm text-slate-500">View past and ongoing data imports.</p>
      </div>

      {imports.length === 0 ? (
        <p className="text-slate-500">No imports yet.</p>
      ) : (
        <div className="space-y-2">
          {imports.map((job) => (
            <div
              key={job.id}
              className="rounded-lg border border-slate-800/60 bg-slate-900 px-4 py-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-300">
                    {job.provider}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${IMPORT_STATUS_COLORS[job.status] || "bg-slate-700 text-slate-400"}`}>
                    {job.status.replace("_", " ")}
                  </span>
                </div>
                <span className="text-xs text-slate-600">
                  {new Date(job.created_at).toLocaleDateString()}
                </span>
              </div>
              {job.total_items > 0 && (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{job.imported_items} / {job.total_items} items</span>
                    <span>{job.progress}%</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all"
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────── Main Page ──────────────────────────────

export default function OrganizationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;

  const [org, setOrg] = useState<OrganizationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("general");

  const fetchOrg = useCallback(async () => {
    try {
      const data = await getOrganization(orgId);
      setOrg(data);
    } catch {
      router.push("/organizations");
    } finally {
      setIsLoading(false);
    }
  }, [orgId, router]);

  useEffect(() => {
    fetchOrg();
  }, [fetchOrg]);

  if (isLoading) return <p className="text-slate-500">Loading organization...</p>;
  if (!org) return null;

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4">
        <Link
          href="/organizations"
          className="text-sm text-slate-500 transition-colors hover:text-slate-300"
        >
          &larr; Organizations
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-medium tracking-tight text-white">{org.name}</h1>
          {!org.is_active && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />
              Inactive
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 border-b border-slate-800/60">
        <nav className="-mb-px flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-slate-500 hover:border-slate-700 hover:text-slate-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="mt-6">
        {activeTab === "general" && (
          <GeneralTab org={org} orgId={orgId} onUpdated={fetchOrg} />
        )}
        {activeTab === "members" && <MembersTab orgId={orgId} />}
        {activeTab === "settings" && <SettingsTab orgId={orgId} />}
        {activeTab === "credentials" && <CredentialsTab orgId={orgId} />}
        {activeTab === "integrations" && <IntegrationsTab orgId={orgId} />}
        {activeTab === "imports" && <ImportsTab orgId={orgId} />}
      </div>
    </div>
  );
}
