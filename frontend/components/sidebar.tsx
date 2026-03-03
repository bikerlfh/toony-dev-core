"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useOrg } from "@/contexts/org-context";
import { OrgSwitcher } from "./org-switcher";
import { SearchCommandPalette } from "./search-command-palette";

const NAV_ITEMS = [
  { label: "Dashboard", path: "" },
  { label: "Teams", path: "/teams" },
  { label: "Projects", path: "/projects" },
  { label: "Labels", path: "/labels" },
  { label: "Members", path: "/members" },
  { label: "Agents", path: "/agents" },
  { label: "Toony Agents", path: "/toony-agents" },
  { label: "Imports", path: "/imports" },
  { label: "Credentials", path: "/credentials" },
  { label: "Settings", path: "/settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { currentOrg } = useOrg();

  if (!currentOrg) return null;

  const basePath = `/${currentOrg.slug}`;

  return (
    <aside className="flex w-64 flex-col border-r border-slate-800/60 bg-slate-950">
      {/* Org Switcher */}
      <div className="border-b border-slate-800/60 p-4">
        <OrgSwitcher />
      </div>

      {/* Search */}
      <div className="px-4 pt-4">
        <button
          onClick={() =>
            document.dispatchEvent(
              new KeyboardEvent("keydown", { key: "k", metaKey: true })
            )
          }
          className="flex w-full items-center gap-2 rounded-md border border-slate-800 px-3 py-1.5 text-sm text-slate-500 transition-colors hover:border-slate-700 hover:text-slate-400"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <span className="flex-1 text-left">Search...</span>
          <kbd className="rounded border border-slate-700 px-1 text-xs text-slate-600">
            &#8984;K
          </kbd>
        </button>
      </div>

      <SearchCommandPalette />

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 p-4">
        {NAV_ITEMS.map((item) => {
          const href = `${basePath}${item.path}`;
          const isActive =
            item.path === ""
              ? pathname === basePath || pathname === `${basePath}/`
              : pathname.startsWith(href);

          return (
            <Link
              key={item.path}
              href={href}
              className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-slate-900 text-white"
                  : "text-slate-400 hover:bg-slate-900/60 hover:text-slate-200"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User info + logout */}
      <div className="border-t border-slate-800/60 p-4">
        <div className="mb-1 text-sm font-medium text-slate-300">
          {user?.first_name} {user?.last_name}
        </div>
        <div className="mb-3 truncate text-xs text-slate-600">{user?.email}</div>
        <button
          onClick={logout}
          className="w-full rounded-md px-3 py-1.5 text-left text-sm text-slate-500 transition-colors hover:bg-slate-900 hover:text-slate-300"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
