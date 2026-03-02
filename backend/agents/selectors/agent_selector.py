from django.db.models import Q

from agents.models import Agent
from accounts.models import OrganizationMembership


def list_agents_for_user(user):
    user_org_ids = OrganizationMembership.objects.filter(
        user=user, is_active=True,
    ).values_list("organization_id", flat=True)

    return Agent.objects.filter(
        Q(organization_id__in=user_org_ids) | Q(organization__isnull=True)
    ).order_by("name")


def get_agent_by_slug(slug, organization=None):
    if organization is not None:
        return Agent.objects.filter(organization=organization, slug=slug).first()
    return Agent.objects.filter(slug=slug).first()


def get_agent_by_id(agent_id):
    return Agent.objects.filter(id=agent_id).first()
