"use client";

import { FormEvent, useState } from "react";
import { updateCredential } from "@/lib/api/credentials";
import type {
  RepositoryCredential,
  CredentialProvider,
  CredentialType,
} from "@/types";

const PROVIDERS: { value: CredentialProvider; label: string }[] = [
  { value: "GITHUB", label: "GitHub" },
  { value: "GITLAB", label: "GitLab" },
  { value: "BITBUCKET", label: "Bitbucket" },
  { value: "CUSTOM", label: "Custom" },
];

const CREDENTIAL_TYPES: { value: CredentialType; label: string }[] = [
  { value: "TOKEN", label: "Token" },
  { value: "SSH_KEY", label: "SSH Key" },
  { value: "APP_CREDENTIAL", label: "App Credential" },
];

interface EditCredentialModalProps {
  orgSlug: string;
  credential: RepositoryCredential;
  onClose: () => void;
  onSaved: () => void;
}

export function EditCredentialModal({
  orgSlug,
  credential,
  onClose,
  onSaved,
}: EditCredentialModalProps) {
  const [name, setName] = useState(credential.name);
  const [provider, setProvider] = useState<CredentialProvider>(
    credential.provider
  );
  const [credentialType, setCredentialType] = useState<CredentialType>(
    credential.credential_type
  );
  const [encryptedValue, setEncryptedValue] = useState("");
  const [urlPattern, setUrlPattern] = useState(credential.url_pattern);
  const [isActive, setIsActive] = useState(credential.is_active);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        name,
        provider,
        credential_type: credentialType,
        url_pattern: urlPattern,
        is_active: isActive,
      };
      if (encryptedValue) {
        payload.encrypted_value = encryptedValue;
      }
      await updateCredential(orgSlug, credential.id, payload);
      onSaved();
      onClose();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })
        ?.response?.data;
      if (data) {
        setError(Object.values(data).flat().join(" "));
      } else {
        setError("Failed to update credential.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Edit credential
        </h2>

        {error && (
          <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Provider
            </label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as CredentialProvider)}
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
              Credential type
            </label>
            <select
              value={credentialType}
              onChange={(e) =>
                setCredentialType(e.target.value as CredentialType)
              }
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            >
              {CREDENTIAL_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Secret value
            </label>
            <input
              type="password"
              value={encryptedValue}
              onChange={(e) => setEncryptedValue(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              placeholder="Enter new value to update"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              URL pattern{" "}
              <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={urlPattern}
              onChange={(e) => setUrlPattern(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is-active"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="is-active" className="text-sm text-gray-700">
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
              {isSubmitting ? "Saving..." : "Save credential"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
