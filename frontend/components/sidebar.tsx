"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useOrg } from "@/contexts/org-context";
import { OrgSwitcher } from "./org-switcher";

const NAV_ITEMS = [
  { label: "Dashboard", path: "" },
  { label: "Teams", path: "/teams" },
  { label: "Projects", path: "/projects" },
  { label: "Labels", path: "/labels" },
  { label: "Members", path: "/members" },
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
    <aside className="flex w-64 flex-col bg-gray-900 text-white">
      {/* Org Switcher */}
      <div className="border-b border-gray-700 p-4">
        <OrgSwitcher />
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
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
              className={`block rounded px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-gray-800 text-white"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User info + logout */}
      <div className="border-t border-gray-700 p-4">
        <div className="mb-2 text-sm text-gray-300">
          {user?.first_name} {user?.last_name}
        </div>
        <div className="mb-3 truncate text-xs text-gray-500">{user?.email}</div>
        <button
          onClick={logout}
          className="w-full rounded px-3 py-1.5 text-left text-sm text-gray-400 hover:bg-gray-800 hover:text-white"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
