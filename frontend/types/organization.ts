import type { User } from "./auth";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string;
  industry: string;
  logo: string;
  is_active: boolean;
  member_count: number;
  created_at: string;
}

export interface OrganizationDetail extends Organization {
  description: string;
  website: string;
  industry: string;
  updated_at: string;
}

export interface CreateOrganizationPayload {
  name: string;
  slug: string;
  description?: string;
  website?: string;
  industry?: string;
}

export interface UpdateOrganizationPayload {
  name?: string;
  description?: string;
  website?: string;
  industry?: string;
  is_active?: boolean;
}

export type MembershipRole = "OWNER" | "ADMIN" | "MANAGER" | "MEMBER" | "VIEWER";

export interface Member {
  id: string;
  user: User;
  role: MembershipRole;
  joined_at: string;
  is_active: boolean;
}

export interface AddMemberPayload {
  email: string;
  role?: MembershipRole;
}

export interface UpdateMemberRolePayload {
  role: MembershipRole;
}
