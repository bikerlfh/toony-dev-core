"use client";

import { OrgProvider } from "@/contexts/org-context";
import { Sidebar } from "@/components/sidebar";

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  return (
    <OrgProvider>
      <div className="flex min-h-screen bg-slate-950">
        <Sidebar />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </OrgProvider>
  );
}
