"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useOrg } from "@/contexts/org-context";
import { canEditOrg } from "@/lib/roles";
import { listCredentials, deleteCredential } from "@/lib/api/credentials";
import {
  listIntegrations,
  deleteIntegration,
} from "@/lib/api/integrations";
import { ConfirmModal } from "@/components/confirm-modal";
import { CreateCredentialModal } from "@/components/create-credential-modal";
import { EditCredentialModal } from "@/components/edit-credential-modal";
import { CreateIntegrationModal } from "@/components/create-integration-modal";
import { EditIntegrationModal } from "@/components/edit-integration-modal";
import type { RepositoryCredential, IntegrationConfig } from "@/types";

const PROVIDER_LABELS: Record<string, string> = {
  GITHUB: "GitHub",
  GITLAB: "GitLab",
  BITBUCKET: "Bitbucket",
  LINEAR: "Linear",
  JIRA: "Jira",
  TRELLO: "Trello",
  SLACK: "Slack",
  CUSTOM: "Custom",
};

const CREDENTIAL_TYPE_LABELS: Record<string, string> = {
  TOKEN: "Token",
  SSH_KEY: "SSH Key",
  APP_CREDENTIAL: "App Credential",
};

type Tab = "credentials" | "integrations";

export default function CredentialsPage() {
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const { currentMembership } = useOrg();

  const [activeTab, setActiveTab] = useState<Tab>("credentials");
  const canManage = canEditOrg(currentMembership?.role);

  // Credentials state
  const [credentials, setCredentials] = useState<RepositoryCredential[]>([]);
  const [credLoading, setCredLoading] = useState(true);
  const [showCreateCred, setShowCreateCred] = useState(false);
  const [editCred, setEditCred] = useState<RepositoryCredential | null>(null);
  const [deleteCred, setDeleteCred] = useState<RepositoryCredential | null>(
    null
  );
  const [isDeletingCred, setIsDeletingCred] = useState(false);

  // Integrations state
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>([]);
  const [intLoading, setIntLoading] = useState(true);
  const [showCreateInt, setShowCreateInt] = useState(false);
  const [editInt, setEditInt] = useState<IntegrationConfig | null>(null);
  const [deleteInt, setDeleteInt] = useState<IntegrationConfig | null>(null);
  const [isDeletingInt, setIsDeletingInt] = useState(false);

  const fetchCredentials = useCallback(async () => {
    try {
      setCredentials((await listCredentials(orgSlug)).results);
    } finally {
      setCredLoading(false);
    }
  }, [orgSlug]);

  const fetchIntegrations = useCallback(async () => {
    try {
      setIntegrations((await listIntegrations(orgSlug)).results);
    } finally {
      setIntLoading(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    fetchCredentials();
    fetchIntegrations();
  }, [fetchCredentials, fetchIntegrations]);

  async function handleDeleteCred() {
    if (!deleteCred) return;
    setIsDeletingCred(true);
    try {
      await deleteCredential(orgSlug, deleteCred.id);
      setDeleteCred(null);
      fetchCredentials();
    } finally {
      setIsDeletingCred(false);
    }
  }

  async function handleDeleteInt() {
    if (!deleteInt) return;
    setIsDeletingInt(true);
    try {
      await deleteIntegration(orgSlug, deleteInt.id);
      setDeleteInt(null);
      fetchIntegrations();
    } finally {
      setIsDeletingInt(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-medium tracking-tight text-white">Credentials</h1>

      {/* Tabs */}
      <div className="mt-4 flex border-b border-slate-800/60">
        <button
          onClick={() => setActiveTab("credentials")}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "credentials"
              ? "border-b-2 border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-500 hover:border-slate-700 hover:text-slate-300"
          }`}
        >
          Repository Credentials
        </button>
        <button
          onClick={() => setActiveTab("integrations")}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "integrations"
              ? "border-b-2 border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-500 hover:border-slate-700 hover:text-slate-300"
          }`}
        >
          Integrations
        </button>
      </div>

      {/* Credentials tab */}
      {activeTab === "credentials" && (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-200">
              Repository Credentials
            </h2>
            {canManage && (
              <button
                onClick={() => setShowCreateCred(true)}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
              >
                Add credential
              </button>
            )}
          </div>

          {credLoading ? (
            <p className="mt-4 text-slate-500">Loading credentials...</p>
          ) : credentials.length === 0 ? (
            <p className="mt-4 text-slate-500">No credentials configured.</p>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-800/60">
              <table className="min-w-full divide-y divide-slate-800/60">
                <thead className="bg-slate-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">
                      Provider
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">
                      Status
                    </th>
                    {canManage && (
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase text-slate-500">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {credentials.map((cred) => (
                    <tr key={cred.id} className="hover:bg-slate-900/60">
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-200">
                        {cred.name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-400">
                        {PROVIDER_LABELS[cred.provider] || cred.provider}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-400">
                        {CREDENTIAL_TYPE_LABELS[cred.credential_type] ||
                          cred.credential_type}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            cred.is_active
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {cred.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      {canManage && (
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                          <button
                            onClick={() => setEditCred(cred)}
                            className="text-indigo-400 transition-colors hover:text-indigo-300"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteCred(cred)}
                            className="ml-3 text-red-400 transition-colors hover:text-red-300"
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Integrations tab */}
      {activeTab === "integrations" && (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-200">
              Integrations
            </h2>
            {canManage && (
              <button
                onClick={() => setShowCreateInt(true)}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
              >
                Add integration
              </button>
            )}
          </div>

          {intLoading ? (
            <p className="mt-4 text-slate-500">Loading integrations...</p>
          ) : integrations.length === 0 ? (
            <p className="mt-4 text-slate-500">No integrations configured.</p>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-800/60">
              <table className="min-w-full divide-y divide-slate-800/60">
                <thead className="bg-slate-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">
                      Provider
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">
                      Webhook URL
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">
                      Status
                    </th>
                    {canManage && (
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase text-slate-500">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {integrations.map((int_) => (
                    <tr key={int_.id} className="hover:bg-slate-900/60">
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-200">
                        {PROVIDER_LABELS[int_.provider] || int_.provider}
                      </td>
                      <td className="max-w-xs truncate px-4 py-3 text-sm text-slate-400">
                        {int_.webhook_url || "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            int_.is_active
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {int_.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      {canManage && (
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                          <button
                            onClick={() => setEditInt(int_)}
                            className="text-indigo-400 transition-colors hover:text-indigo-300"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteInt(int_)}
                            className="ml-3 text-red-400 transition-colors hover:text-red-300"
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Credential modals */}
      {showCreateCred && (
        <CreateCredentialModal
          orgSlug={orgSlug}
          onClose={() => setShowCreateCred(false)}
          onSaved={fetchCredentials}
        />
      )}
      {editCred && (
        <EditCredentialModal
          orgSlug={orgSlug}
          credential={editCred}
          onClose={() => setEditCred(null)}
          onSaved={fetchCredentials}
        />
      )}
      {deleteCred && (
        <ConfirmModal
          title="Delete credential"
          message={`Delete credential "${deleteCred.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          confirmVariant="danger"
          isLoading={isDeletingCred}
          onConfirm={handleDeleteCred}
          onCancel={() => setDeleteCred(null)}
        />
      )}

      {/* Integration modals */}
      {showCreateInt && (
        <CreateIntegrationModal
          orgSlug={orgSlug}
          onClose={() => setShowCreateInt(false)}
          onSaved={fetchIntegrations}
        />
      )}
      {editInt && (
        <EditIntegrationModal
          orgSlug={orgSlug}
          integration={editInt}
          onClose={() => setEditInt(null)}
          onSaved={fetchIntegrations}
        />
      )}
      {deleteInt && (
        <ConfirmModal
          title="Delete integration"
          message={`Delete the ${PROVIDER_LABELS[deleteInt.provider] || deleteInt.provider} integration? This cannot be undone.`}
          confirmLabel="Delete"
          confirmVariant="danger"
          isLoading={isDeletingInt}
          onConfirm={handleDeleteInt}
          onCancel={() => setDeleteInt(null)}
        />
      )}
    </div>
  );
}
