from rest_framework.permissions import BasePermission

from organizations.permissions import get_membership
from projects.selectors import get_project_by_slug


class IsProjectAccessible(BasePermission):
    """Require org membership and resolve project from URL."""

    def has_permission(self, request, view):
        org_slug = view.kwargs.get("org_slug")
        project_slug = view.kwargs.get("project_slug")
        if not org_slug or not project_slug:
            return False

        membership = get_membership(request.user, org_slug)
        if membership is None:
            return False

        project = get_project_by_slug(membership.organization, project_slug)
        if project is None:
            return False

        request.membership = membership
        request.organization = membership.organization
        request.project = project
        return True
