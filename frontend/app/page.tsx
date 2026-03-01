"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { listOrganizations } from "@/lib/api/organizations";
import { CreateOrgModal } from "@/components/create-org-modal";
import type { Organization } from "@/types";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [showCreateOrg, setShowCreateOrg] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      setOrgsLoading(true);
      listOrganizations()
        .then((res) => {
          setOrgs(res.results);
          if (res.results.length > 0) {
            router.replace(`/${res.results[0].slug}/`);
          }
        })
        .finally(() => setOrgsLoading(false));
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || orgsLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </main>
    );
  }

  // Unauthenticated landing
  if (!isAuthenticated) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center">
        <h1 className="text-4xl font-bold text-gray-900">Toony Dev Core</h1>
        <p className="mt-4 text-lg text-gray-600">
          Project management for software development teams
        </p>
        <div className="mt-8 flex gap-4">
          <Link
            href="/login"
            className="rounded bg-indigo-600 px-6 py-2 text-white hover:bg-indigo-700"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded border border-indigo-600 px-6 py-2 text-indigo-600 hover:bg-indigo-50"
          >
            Sign up
          </Link>
        </div>
      </main>
    );
  }

  // Authenticated but no orgs
  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-2xl font-bold text-gray-900">Welcome to Toony</h1>
      <p className="mt-2 text-gray-600">
        Create your first organization to get started.
      </p>
      <button
        onClick={() => setShowCreateOrg(true)}
        className="mt-6 rounded bg-indigo-600 px-6 py-2 text-white hover:bg-indigo-700"
      >
        Create organization
      </button>

      {showCreateOrg && (
        <CreateOrgModal
          onClose={() => setShowCreateOrg(false)}
          onCreated={(org) => router.push(`/${org.slug}/`)}
        />
      )}
    </main>
  );
}
