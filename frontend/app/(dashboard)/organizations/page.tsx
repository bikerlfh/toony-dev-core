"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { listOrganizations } from "@/lib/api/organizations";
import type { Organization } from "@/types";

type OrgWithOptionalDescription = Organization & { description?: string };

export default function OrganizationsPage() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<OrgWithOptionalDescription[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchOrganizations = useCallback(async () => {
    try {
      const res = await listOrganizations();
      setOrganizations(res.results as OrgWithOptionalDescription[]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  if (isLoading) {
    return <p className="text-slate-500">Loading organizations...</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium tracking-tight text-white">Organizations</h1>
        <Link
          href="/organizations/new"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          Create organization
        </Link>
      </div>

      {organizations.length === 0 ? (
        <p className="mt-6 text-slate-500">No organizations yet.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {organizations.map((org) => (
            <div
              key={org.id}
              className="cursor-pointer rounded-xl border border-slate-800/60 bg-slate-900 p-5 transition-colors hover:border-slate-600/50"
              onClick={() => router.push(`/organizations/${org.id}`)}
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-white">{org.name}</h3>
                  <span className="mt-1 inline-block rounded-md bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-400">
                    {org.slug}
                  </span>
                </div>
              </div>
              {org.description && (
                <p className="mt-3 line-clamp-2 text-sm text-slate-400">
                  {org.description}
                </p>
              )}
              <p className="mt-3 text-xs text-slate-600">
                Created {new Date(org.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
