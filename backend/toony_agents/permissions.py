from rest_framework.permissions import BasePermission

from organizations.permissions import get_membership


class IsToonyAgentOrgMember(BasePermission):
    """Require org membership. Resolves org + membership onto request."""

    def has_permission(self, request, view):
        org_slug = view.kwargs.get("org_slug")
        if not org_slug:
            return False
        membership = get_membership(request.user, org_slug)
        if membership is None:
            return False
        request.membership = membership
        request.organization = membership.organization
        return True
