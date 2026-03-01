import type { User } from "./auth";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo: string;
  is_active: boolean;
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

export type MethodologyChoice = "SCRUM" | "KANBAN" | "CUSTOM";

export interface OrganizationSettings {
  id: string;
  default_project_methodology: MethodologyChoice;
  timezone: string;
  notification_preferences: Record<string, unknown>;
  allowed_ip_ranges: string[] | null;
  audit_log_retention_days: number;
  updated_at: string;
}

export interface UpdateOrganizationSettingsPayload {
  default_project_methodology?: MethodologyChoice;
  timezone?: string;
  notification_preferences?: Record<string, unknown>;
  allowed_ip_ranges?: string[] | null;
  audit_log_retention_days?: number;
}
