"use client";

import { FormEvent, useState } from "react";
import { updateIntegration } from "@/lib/api/integrations";
import type { IntegrationConfig, IntegrationProvider } from "@/types";

const PROVIDERS: { value: IntegrationProvider; label: string }[] = [
  { value: "LINEAR", label: "Linear" },
  { value: "JIRA", label: "Jira" },
  { value: "TRELLO", label: "Trello" },
  { value: "SLACK", label: "Slack" },
  { value: "CUSTOM", label: "Custom" },
];

interface EditIntegrationModalProps {
  orgSlug: string;
  integration: IntegrationConfig;
  onClose: () => void;
  onSaved: () => void;
}

export function EditIntegrationModal({
  orgSlug,
  integration,
  onClose,
  onSaved,
}: EditIntegrationModalProps) {
  const [provider, setProvider] = useState<IntegrationProvider>(
    integration.provider
  );
  const [encryptedCredentials, setEncryptedCredentials] = useState("");
  const [webhookUrl, setWebhookUrl] = useState(integration.webhook_url);
  const [isActive, setIsActive] = useState(integration.is_active);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        provider,
        webhook_url: webhookUrl,
        is_active: isActive,
      };
      if (encryptedCredentials) {
        payload.encrypted_credentials = encryptedCredentials;
      }
      await updateIntegration(orgSlug, integration.id, payload);
      onSaved();
      onClose();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })
        ?.response?.data;
      if (data) {
        setError(Object.values(data).flat().join(" "));
      } else {
        setError("Failed to update integration.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Edit integration
        </h2>

        {error && (
          <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Provider
            </label>
            <select
              value={provider}
              onChange={(e) =>
                setProvider(e.target.value as IntegrationProvider)
              }
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Credentials (JSON)
            </label>
            <textarea
              value={encryptedCredentials}
              onChange={(e) => setEncryptedCredentials(e.target.value)}
              rows={4}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              placeholder="Enter new credentials to update"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Webhook URL{" "}
              <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="integration-active"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label
              htmlFor="integration-active"
              className="text-sm text-gray-700"
            >
              Active
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : "Save integration"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
