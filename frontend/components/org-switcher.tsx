"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useOrg } from "@/contexts/org-context";
import { CreateOrgModal } from "./create-org-modal";

export function OrgSwitcher() {
  const router = useRouter();
  const { organizations, currentOrg, refreshOrganizations } = useOrg();
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateOrg, setShowCreateOrg] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-slate-900"
      >
        <span className="truncate">{currentOrg?.name ?? "Select org"}</span>
        <svg
          className={`ml-2 h-4 w-4 text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 z-50 mt-1 w-full rounded-lg border border-slate-800/60 bg-slate-900 py-1">
          {organizations.map((org) => (
            <button
              key={org.id}
              onClick={() => {
                router.push(`/${org.slug}/`);
                setIsOpen(false);
              }}
              className={`block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-slate-800/60 ${
                org.slug === currentOrg?.slug
                  ? "text-indigo-400"
                  : "text-slate-300"
              }`}
            >
              {org.name}
            </button>
          ))}

          <div className="border-t border-slate-800/60 mt-1 pt-1">
            <button
              onClick={() => {
                setIsOpen(false);
                setShowCreateOrg(true);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-slate-500 transition-colors hover:bg-slate-800/60 hover:text-slate-300"
            >
              + Create organization
            </button>
          </div>
        </div>
      )}

      {showCreateOrg && (
        <CreateOrgModal
          onClose={() => setShowCreateOrg(false)}
          onCreated={(org) => {
            refreshOrganizations();
            router.push(`/${org.slug}/`);
          }}
        />
      )}
    </div>
  );
}
