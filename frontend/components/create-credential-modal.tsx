"use client";

import { FormEvent, useState } from "react";
import { createCredential } from "@/lib/api/credentials";
import { Select } from "@/components/ui/select";
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

const INPUT_CLASS =
  "mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-xl border border-slate-800/60 bg-slate-900 p-6">
        <h2 className="mb-4 text-base font-medium tracking-tight text-white">Create credential</h2>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
            <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6.25" /><path d="M8 5v3.5M8 10.5h.007" strokeLinecap="round" /></svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400">Name</label>
            <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLASS} placeholder="My GitHub Token" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400">Provider</label>
            <Select
              options={PROVIDERS}
              value={provider}
              onChange={(v) => setProvider(v as CredentialProvider)}
              className="mt-1.5"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400">Credential type</label>
            <Select
              options={CREDENTIAL_TYPES}
              value={credentialType}
              onChange={(v) => setCredentialType(v as CredentialType)}
              className="mt-1.5"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400">Secret value</label>
            <input type="password" required value={encryptedValue} onChange={(e) => setEncryptedValue(e.target.value)} className={INPUT_CLASS} placeholder="ghp_xxxxxxxxxxxx" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400">
              URL pattern <span className="text-slate-600">(optional)</span>
            </label>
            <input type="text" value={urlPattern} onChange={(e) => setUrlPattern(e.target.value)} className={INPUT_CLASS} placeholder="https://github.com/org/*" />
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-600">esc to cancel</span>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50">{isSubmitting ? "Creating..." : "Create credential"}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
