"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useParams } from "next/navigation";
import type { Organization, Member } from "@/types";
import { useAuth } from "./auth-context";
import * as orgApi from "@/lib/api/organizations";
import * as membersApi from "@/lib/api/members";

interface OrgState {
  organizations: Organization[];
  currentOrg: Organization | null;
  currentMembership: Member | null;
  isLoading: boolean;
}

interface OrgContextValue extends OrgState {
  setCurrentOrg: (org: Organization) => void;
  refreshOrganizations: () => Promise<void>;
  refreshCurrentMembership: () => Promise<void>;
}

const OrgContext = createContext<OrgContextValue | null>(null);

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const orgSlug = params?.orgSlug as string | undefined;
  const { user, isAuthenticated } = useAuth();

  const [state, setState] = useState<OrgState>({
    organizations: [],
    currentOrg: null,
    currentMembership: null,
    isLoading: true,
  });

  const refreshOrganizations = useCallback(async () => {
    try {
      const res = await orgApi.listOrganizations();
      setState((prev) => ({
        ...prev,
        organizations: res.results,
        isLoading: false,
      }));
    } catch {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, []);

  const refreshCurrentMembership = useCallback(async () => {
    if (!orgSlug || !user) return;
    try {
      const res = await membersApi.listMembers(orgSlug);
      const myMembership = res.results.find((m) => m.user.id === user.id) ?? null;
      setState((prev) => ({ ...prev, currentMembership: myMembership }));
    } catch {
      setState((prev) => ({ ...prev, currentMembership: null }));
    }
  }, [orgSlug, user]);

  // Load organizations when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      refreshOrganizations();
    }
  }, [isAuthenticated, refreshOrganizations]);

  // Derive currentOrg from URL slug
  useEffect(() => {
    if (orgSlug && state.organizations.length > 0) {
      const org = state.organizations.find((o) => o.slug === orgSlug) ?? null;
      setState((prev) => ({ ...prev, currentOrg: org }));
    }
  }, [orgSlug, state.organizations]);

  // Load current membership when org changes
  useEffect(() => {
    if (state.currentOrg && user) {
      refreshCurrentMembership();
    }
  }, [state.currentOrg, user, refreshCurrentMembership]);

  const setCurrentOrg = useCallback((org: Organization) => {
    setState((prev) => ({ ...prev, currentOrg: org }));
  }, []);

  const value = useMemo<OrgContextValue>(
    () => ({
      ...state,
      setCurrentOrg,
      refreshOrganizations,
      refreshCurrentMembership,
    }),
    [state, setCurrentOrg, refreshOrganizations, refreshCurrentMembership]
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgContextValue {
  const context = useContext(OrgContext);
  if (!context) {
    throw new Error("useOrg must be used within an OrgProvider");
  }
  return context;
}
