from rest_framework.permissions import BasePermission

from organizations.permissions import get_membership
from projects.models import Project


class IsProjectAccessible(BasePermission):
    """Require org membership and resolve project from URL by UUID."""

    def has_permission(self, request, view):
        project_id = view.kwargs.get("project_id")
        if not project_id:
            return False

        project = Project.objects.filter(
            id=project_id,
        ).select_related("lead", "organization").first()
        if project is None:
            return False

        membership = get_membership(request.user, project.organization_id)
        if membership is None:
            return False

        request.membership = membership
        request.organization = membership.organization
        request.project = project
        return True
