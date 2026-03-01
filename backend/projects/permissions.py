from rest_framework.permissions import BasePermission

from organizations.permissions import get_membership, ADMIN_ROLES, MANAGER_ROLES
from projects.selectors import get_team_by_slug


class IsTeamAccessible(BasePermission):
    """Require org membership and resolve team from URL."""

    def has_permission(self, request, view):
        org_slug = view.kwargs.get("org_slug")
        team_slug = view.kwargs.get("team_slug")
        if not org_slug or not team_slug:
            return False

        membership = get_membership(request.user, org_slug)
        if membership is None:
            return False

        team = get_team_by_slug(membership.organization, team_slug)
        if team is None:
            return False

        request.membership = membership
        request.organization = membership.organization
        request.team = team
        return True
