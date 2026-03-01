"use client";

import { FormEvent, useState } from "react";
import { createCredential } from "@/lib/api/credentials";
import type { CredentialProvider, CredentialType } from "@/types";

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

interface CreateCredentialModalProps {
  orgSlug: string;
  onClose: () => void;
  onSaved: () => void;
}

export function CreateCredentialModal({
  orgSlug,
  onClose,
  onSaved,
}: CreateCredentialModalProps) {
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<CredentialProvider>("GITHUB");
  const [credentialType, setCredentialType] = useState<CredentialType>("TOKEN");
  const [encryptedValue, setEncryptedValue] = useState("");
  const [urlPattern, setUrlPattern] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await createCredential(orgSlug, {
        name,
        provider,
        credential_type: credentialType,
        encrypted_value: encryptedValue,
        url_pattern: urlPattern || undefined,
      });
      onSaved();
      onClose();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })
        ?.response?.data;
      if (data) {
        setError(Object.values(data).flat().join(" "));
      } else {
        setError("Failed to create credential.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Create credential
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
              placeholder="My GitHub Token"
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
              required
              value={encryptedValue}
              onChange={(e) => setEncryptedValue(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              placeholder="ghp_xxxxxxxxxxxx"
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
              placeholder="https://github.com/org/*"
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
              {isSubmitting ? "Creating..." : "Create credential"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
