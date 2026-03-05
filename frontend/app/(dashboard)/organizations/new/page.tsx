"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createOrganization } from "@/lib/api/organizations";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const INPUT_CLASS =
  "mt-1.5 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors";

export default function CreateOrganizationPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    setSlug(slugify(value));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);

    const form = e.target as HTMLFormElement;
    if (!form.checkValidity()) return;

    setError("");
    setIsSubmitting(true);

    try {
      const org = await createOrganization({
        name,
        slug,
        description: description || undefined,
        website: website || undefined,
        industry: industry || undefined,
      });
      router.push(`/organizations/${org.id}`);
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, string[]> } })
        ?.response?.data;
      if (data) {
        setError(Object.values(data).flat().join(" "));
      } else {
        setError("Failed to create organization.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/organizations"
          className="text-sm text-slate-500 transition-colors hover:text-slate-300"
        >
          &larr; Back to organizations
        </Link>
      </div>

      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-medium tracking-tight text-white">Create organization</h1>
        <p className="mt-1 text-sm text-slate-500">Set up a new organization to manage your projects and teams.</p>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
            <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="8" r="6.25" />
              <path d="M8 5v3.5M8 10.5h.007" strokeLinecap="round" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          noValidate
          className={`mt-6 space-y-5 ${submitted ? "submitted" : ""}`}
        >
          <div>
            <label className="block text-sm font-medium text-slate-400">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="My Organization"
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400">
              Slug <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="my-organization"
              className={`${INPUT_CLASS} font-mono`}
            />
            <p className="mt-1 text-xs text-slate-600">Used in URLs. Auto-generated from name.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="A brief description of the organization"
              className={`${INPUT_CLASS} resize-none`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400">Website</label>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400">Industry</label>
            <input
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g. Technology, Healthcare, Finance"
              className={INPUT_CLASS}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href="/organizations"
              className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              {isSubmitting ? "Creating..." : "Create organization"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
