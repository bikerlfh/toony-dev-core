from django.db.models import Q

from accounts.models import OrganizationMembership
from toony_agents.models import ToonyAgent, ToonyAgentKey


def list_toony_agents_for_user(user):
    user_org_ids = OrganizationMembership.objects.filter(
        user=user, is_active=True,
    ).values_list("organization_id", flat=True)
    return ToonyAgent.objects.filter(
        Q(organizations__id__in=user_org_ids) | Q(registered_by=user),
    ).distinct().prefetch_related("organizations")


def list_toony_agents_for_organization(organization):
    return ToonyAgent.objects.filter(
        organizations=organization,
    ).prefetch_related("organizations")


def get_toony_agent_by_slug(slug):
    return ToonyAgent.objects.filter(slug=slug).first()


def get_toony_agent_by_id(agent_id):
    return ToonyAgent.objects.filter(id=agent_id).first()


def list_agent_keys(toony_agent):
    return ToonyAgentKey.objects.filter(
        toony_agent=toony_agent,
    ).select_related("created_by")
