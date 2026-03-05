"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { listAgentKeys, generateAgentKey, revokeAgentKey } from "@/lib/api/toony-agents";
import type { ToonyAgentKeyItem } from "@/types";

interface ManageKeysModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: string;
}

export function ManageKeysModal({ isOpen, onClose, agentId }: ManageKeysModalProps) {
  const [keys, setKeys] = useState<ToonyAgentKeyItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Generate key form
  const [keyName, setKeyName] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Revoke state
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      setKeys((await listAgentKeys(agentId)).results);
    } catch {
      setError("Failed to load keys.");
    } finally {
      setIsLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setError("");
      setKeyName("");
      setNewRawKey(null);
      setCopied(false);
      fetchKeys();
    }
  }, [isOpen, fetchKeys]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsGenerating(true);
    setCopied(false);

    try {
      const key = await generateAgentKey(agentId, keyName);
      setNewRawKey(key.raw_key || null);
      setKeyName("");
      fetchKeys();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })
        ?.response?.data;
      if (data) {
        setError(Object.values(data).flat().join(" "));
      } else {
        setError("Failed to generate key.");
      }
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleRevoke(keyId: string) {
    setRevokingId(keyId);
    setError("");
    try {
      await revokeAgentKey(agentId, keyId);
      fetchKeys();
    } catch {
      setError("Failed to revoke key.");
    } finally {
      setRevokingId(null);
    }
  }

  function handleCopy() {
    if (newRawKey) {
      navigator.clipboard.writeText(newRawKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-800/60 bg-slate-900 p-6">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15">
              <svg
                className="h-4 w-4 text-indigo-400"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M5 2v4M11 10v4M2 5h4M10 11h4M11 2l-1.5 1.5M5 12.5L3.5 14M14 5l-1.5-1.5M3.5 12.5L2 11" strokeLinecap="round" />
              </svg>
            </span>
            <h2 className="text-base font-medium tracking-tight text-white">
              Manage API keys
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
            <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="8" r="6.25" />
              <path d="M8 5v3.5M8 10.5h.007" strokeLinecap="round" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Newly generated key warning box */}
        {newRawKey && (
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="mb-2 text-xs font-medium text-amber-400">
              Copy this key now. You will not be able to see it again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded bg-slate-950 px-2 py-1.5 font-mono text-xs text-slate-200">
                {newRawKey}
              </code>
              <button
                onClick={handleCopy}
                className="shrink-0 rounded-md border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-600 hover:text-white"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}

        {/* Generate key form */}
        <form onSubmit={handleGenerate} className="mb-5 flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-400">
              New key name
            </label>
            <input
              type="text"
              required
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="production-key"
              className="mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={isGenerating}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {isGenerating ? (
              <span className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Generating...
              </span>
            ) : (
              "Generate key"
            )}
          </button>
        </form>

        {/* Keys list */}
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading keys...</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-slate-500">No keys generated yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-800/60">
            <table className="min-w-full divide-y divide-slate-800/60">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">Name</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">Prefix</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">Last used</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {keys.map((key) => (
                  <tr key={key.id} className="hover:bg-slate-900/60">
                    <td className="whitespace-nowrap px-3 py-2 text-sm text-slate-200">
                      {key.name}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-400">
                      {key.key_prefix}...
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-sm">
                      {key.is_active ? (
                        <span className="inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-slate-500/15 px-2 py-0.5 text-xs font-medium text-slate-400">
                          Revoked
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                      {formatDate(key.last_used_at)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-sm">
                      {key.is_active && (
                        <button
                          onClick={() => handleRevoke(key.id)}
                          disabled={revokingId === key.id}
                          className="text-red-400 transition-colors hover:text-red-300 disabled:opacity-50"
                        >
                          {revokingId === key.id ? "Revoking..." : "Revoke"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
