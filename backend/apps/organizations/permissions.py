from rest_framework.permissions import BasePermission

from accounts.models import MembershipRole, OrganizationMembership


def get_membership(user, org_id):
    return (
        OrganizationMembership.objects.filter(
            user=user,
            organization_id=org_id,
            is_active=True,
        )
        .select_related("organization")
        .first()
    )


ADMIN_ROLES = {MembershipRole.OWNER, MembershipRole.ADMIN}
MANAGER_ROLES = ADMIN_ROLES | {MembershipRole.MANAGER}
ALL_ROLES = MANAGER_ROLES | {MembershipRole.MEMBER, MembershipRole.VIEWER}
WRITE_ROLES = MANAGER_ROLES | {MembershipRole.MEMBER}


class IsOrganizationMember(BasePermission):
    def has_permission(self, request, view):
        org_id = view.kwargs.get("org_id")
        if not org_id:
            return False
        membership = get_membership(request.user, org_id)
        if membership is None:
            return False
        request.membership = membership
        request.organization = membership.organization
        return True


class IsOrganizationAdmin(BasePermission):
    def has_permission(self, request, view):
        org_id = view.kwargs.get("org_id")
        if not org_id:
            return False
        membership = get_membership(request.user, org_id)
        if membership is None or membership.role not in ADMIN_ROLES:
            return False
        request.membership = membership
        request.organization = membership.organization
        return True


class IsOrganizationManager(BasePermission):
    def has_permission(self, request, view):
        org_id = view.kwargs.get("org_id")
        if not org_id:
            return False
        membership = get_membership(request.user, org_id)
        if membership is None or membership.role not in MANAGER_ROLES:
            return False
        request.membership = membership
        request.organization = membership.organization
        return True


class IsOrganizationOwner(BasePermission):
    def has_permission(self, request, view):
        org_id = view.kwargs.get("org_id")
        if not org_id:
            return False
        membership = get_membership(request.user, org_id)
        if membership is None or membership.role != MembershipRole.OWNER:
            return False
        request.membership = membership
        request.organization = membership.organization
        return True
