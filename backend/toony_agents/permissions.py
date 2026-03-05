from rest_framework.permissions import BasePermission

from accounts.models import OrganizationMembership
from toony_agents.models import ToonyAgent


class IsToonyAgentOrgMember(BasePermission):
    """
    Require the user to be a member of at least one organization
    that the toony agent belongs to.

    Resolves agent onto request.toony_agent.
    """

    def has_permission(self, request, view):
        agent_id = view.kwargs.get("agent_id")
        if not agent_id:
            # For list/create endpoints that don't have agent_id in the URL,
            # just require authentication (handled by IsAuthenticated).
            return True

        agent = ToonyAgent.objects.filter(id=agent_id).first()
        if agent is None:
            return False

        if agent.registered_by == request.user:
            request.toony_agent = agent
            return True

        agent_org_ids = agent.organizations.values_list("id", flat=True)
        has_membership = OrganizationMembership.objects.filter(
            user=request.user,
            organization_id__in=agent_org_ids,
            is_active=True,
        ).exists()

        if not has_membership:
            return False

        request.toony_agent = agent
        return True
