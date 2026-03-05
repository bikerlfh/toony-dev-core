"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { createToonyAgent } from "@/lib/api/toony-agents";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

interface RegisterBotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (agentId: string) => void;
}

export function RegisterBotModal({ isOpen, onClose, onSuccess }: RegisterBotModalProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);

  // Auto-focus name field on mount
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => nameRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setName("");
      setSlug("");
      setError("");
      setIsSubmitting(false);
      setSlugManuallyEdited(false);
    }
  }, [isOpen]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const agent = await createToonyAgent({ name, slug });
      onSuccess(agent.id);
      onClose();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })
        ?.response?.data;
      if (data) {
        const messages = Object.values(data).flat();
        setError(messages.join(" "));
      } else {
        setError("Failed to register bot.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen) return null;

  const INPUT_CLASS =
    "mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-slate-800/60 bg-slate-900 p-6">
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
                <path d="M8 3v10M3 8h10" strokeLinecap="round" />
              </svg>
            </span>
            <h2 className="text-base font-medium tracking-tight text-white">
              Register bot
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

        <form onSubmit={handleSubmit}>
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-400">
              Name
            </label>
            <input
              ref={nameRef}
              type="text"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugManuallyEdited) {
                  setSlug(slugify(e.target.value));
                }
              }}
              placeholder="My CI Bot"
              className={INPUT_CLASS}
            />
          </div>

          {/* Slug */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-400">
              Slug
            </label>
            <input
              type="text"
              required
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugManuallyEdited(true);
              }}
              placeholder="my-ci-bot"
              className={INPUT_CLASS}
            />
            <p className="mt-1 text-xs text-slate-600">
              Unique identifier used in URLs and API calls.
            </p>
          </div>

          {/* Actions */}
          <div className="mt-6 flex items-center justify-between">
            <span className="text-xs text-slate-600">
              esc to cancel
            </span>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Registering...
                  </span>
                ) : (
                  "Register bot"
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
