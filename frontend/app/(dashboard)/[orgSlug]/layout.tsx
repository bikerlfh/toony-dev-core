"use client";

import { OrgProvider } from "@/contexts/org-context";
import { Sidebar } from "@/components/sidebar";

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  return (
    <OrgProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 bg-gray-50 p-6">{children}</main>
      </div>
    </OrgProvider>
  );
}
