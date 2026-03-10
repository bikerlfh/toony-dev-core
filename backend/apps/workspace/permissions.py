from rest_framework.permissions import BasePermission

from accounts.models.membership import MembershipRole, OrganizationMembership

ADMIN_ROLES = {MembershipRole.OWNER, MembershipRole.ADMIN}


class IsWorkspaceAdmin(BasePermission):
    """User is authenticated and ADMIN+ in at least one organization."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return OrganizationMembership.objects.filter(
            user=request.user,
            role__in=ADMIN_ROLES,
            is_active=True,
            organization__is_active=True,
        ).exists()


class IsWorkspaceMember(BasePermission):
    """User is authenticated and a member of at least one organization."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return OrganizationMembership.objects.filter(
            user=request.user,
            is_active=True,
            organization__is_active=True,
        ).exists()
