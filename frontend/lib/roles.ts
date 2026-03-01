import type { MembershipRole } from "@/types";

const ROLE_HIERARCHY: Record<MembershipRole, number> = {
  OWNER: 0,
  ADMIN: 1,
  MANAGER: 2,
  MEMBER: 3,
  VIEWER: 4,
};

export function hasMinRole(
  userRole: MembershipRole | undefined | null,
  requiredRole: MembershipRole
): boolean {
  if (!userRole) return false;
  return ROLE_HIERARCHY[userRole] <= ROLE_HIERARCHY[requiredRole];
}

export function canManageMembers(role: MembershipRole | undefined | null): boolean {
  return hasMinRole(role, "ADMIN");
}

export function canEditOrg(role: MembershipRole | undefined | null): boolean {
  return hasMinRole(role, "ADMIN");
}

export function canDeleteOrg(role: MembershipRole | undefined | null): boolean {
  return hasMinRole(role, "OWNER");
}

export function canManageTeams(role: MembershipRole | undefined | null): boolean {
  return hasMinRole(role, "ADMIN");
}

export function canCreateProject(role: MembershipRole | undefined | null): boolean {
  return hasMinRole(role, "MANAGER");
}

export function canManageLabels(role: MembershipRole | undefined | null): boolean {
  return hasMinRole(role, "ADMIN");
}
