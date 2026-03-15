"use client";

import { Sidebar } from "@/components/sidebar";
import { NotificationProvider } from "@/contexts/notification-context";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <NotificationProvider>
      <div className="flex min-h-screen bg-slate-950">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-hidden p-6">
          {children}
        </main>
      </div>
    </NotificationProvider>
  );
}
