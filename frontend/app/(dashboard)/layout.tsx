"use client";

import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { NotificationProvider } from "@/contexts/notification-context";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <NotificationProvider>
      <div className="flex min-h-screen bg-slate-950">
        <Sidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <Header />
          <main className="flex-1 overflow-hidden p-6">
            {children}
          </main>
        </div>
      </div>
    </NotificationProvider>
  );
}
