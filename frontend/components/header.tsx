"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { UserAvatar } from "@/components/ui/user-avatar";
import { NotificationDropdown } from "./notification-dropdown";

const ROUTE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  tasks: "Tasks",
  projects: "Projects",
  organizations: "Organizations",
  teams: "Teams",
  notifications: "Notifications",
  labels: "Labels",
  subagents: "Sub-Agents",
  skills: "Skills",
  "toony-agents": "Toony Agents",
  workflows: "Workflows",
  artifacts: "Artifacts",
  profile: "Profile",
  issues: "Issues",
  new: "New",
  edit: "Edit",
};

function buildBreadcrumbs(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: { label: string; href: string }[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const href = "/" + segments.slice(0, i + 1).join("/");
    const label = ROUTE_LABELS[segment] || null;

    // Skip UUID segments — they are detail pages, shown by the next named segment or page title
    if (segment.match(/^[0-9a-f]{8}-/)) continue;

    if (label) {
      crumbs.push({ label, href });
    }
  }

  return crumbs;
}

export function Header() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const breadcrumbs = buildBreadcrumbs(pathname);

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [userMenuOpen]);

  // Close on Escape
  useEffect(() => {
    if (!userMenuOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setUserMenuOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [userMenuOpen]);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-800/60 px-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-sm">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.href} className="flex items-center gap-1.5">
            {i > 0 && (
              <svg className="h-3.5 w-3.5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            )}
            {i === breadcrumbs.length - 1 ? (
              <span className="font-medium text-slate-300">{crumb.label}</span>
            ) : (
              <Link
                href={crumb.href}
                className="text-slate-500 transition-colors hover:text-slate-300"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        ))}
      </nav>

      {/* Right side: notifications + user */}
      <div className="flex items-center gap-2">
        <NotificationDropdown />

        {/* User menu */}
        <div ref={userMenuRef} className="relative">
          <button
            onClick={() => setUserMenuOpen((prev) => !prev)}
            className="flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-slate-900/60"
          >
            {user && (
              <UserAvatar
                userId={user.id}
                firstName={user.first_name}
                lastName={user.last_name}
                email={user.email}
                avatarStyle={user.avatar_style}
                size={28}
              />
            )}
            <span className="text-sm text-slate-400">
              {user?.first_name}
            </span>
            <svg className="h-3.5 w-3.5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-full z-50 mt-1.5 w-56 rounded-lg border border-slate-800/60 bg-slate-900 py-1 shadow-xl">
              {/* User info */}
              <div className="border-b border-slate-800/60 px-4 py-3">
                <p className="text-sm font-medium text-slate-300">
                  {user?.first_name} {user?.last_name}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{user?.email}</p>
              </div>

              {/* Menu items */}
              <div className="py-1">
                <Link
                  href="/profile"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800/50 hover:text-slate-200"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                  Profile
                </Link>
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    logout();
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800/50 hover:text-slate-200"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                  </svg>
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
