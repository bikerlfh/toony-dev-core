"use client";

import { useOrg } from "@/contexts/org-context";

export default function DashboardPage() {
  const { currentOrg } = useOrg();

  return (
    <div>
      <h1 className="text-2xl font-medium tracking-tight text-white">
        {currentOrg?.name ?? "Dashboard"}
      </h1>
      <p className="mt-2 text-sm text-slate-400">
        Welcome to your organization dashboard. More features coming soon.
      </p>
    </div>
  );
}
