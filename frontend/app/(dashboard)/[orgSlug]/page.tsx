"use client";

import { useOrg } from "@/contexts/org-context";

export default function DashboardPage() {
  const { currentOrg } = useOrg();

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">
        {currentOrg?.name ?? "Dashboard"}
      </h1>
      <p className="mt-2 text-gray-600">
        Welcome to your organization dashboard. More features coming soon.
      </p>
    </div>
  );
}
