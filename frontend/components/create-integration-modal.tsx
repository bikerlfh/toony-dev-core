"use client";

import { FormEvent, useState } from "react";
import { createIntegration } from "@/lib/api/integrations";
import type { IntegrationProvider } from "@/types";

const PROVIDERS: { value: IntegrationProvider; label: string }[] = [
  { value: "LINEAR", label: "Linear" },
  { value: "JIRA", label: "Jira" },
  { value: "TRELLO", label: "Trello" },
  { value: "SLACK", label: "Slack" },
  { value: "CUSTOM", label: "Custom" },
];

interface CreateIntegrationModalProps {
  orgSlug: string;
  onClose: () => void;
  onSaved: () => void;
}

export function CreateIntegrationModal({
  orgSlug,
  onClose,
  onSaved,
}: CreateIntegrationModalProps) {
  const [provider, setProvider] = useState<IntegrationProvider>("LINEAR");
  const [encryptedCredentials, setEncryptedCredentials] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await createIntegration(orgSlug, {
        provider,
        encrypted_credentials: encryptedCredentials,
        webhook_url: webhookUrl || undefined,
      });
      onSaved();
      onClose();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })
        ?.response?.data;
      if (data) {
        setError(Object.values(data).flat().join(" "));
      } else {
        setError("Failed to create integration.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Create integration
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
              required
              value={encryptedCredentials}
              onChange={(e) => setEncryptedCredentials(e.target.value)}
              rows={4}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              placeholder='{"api_key": "...", "api_secret": "..."}'
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
              placeholder="https://hooks.example.com/..."
            />
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
              {isSubmitting ? "Creating..." : "Create integration"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
