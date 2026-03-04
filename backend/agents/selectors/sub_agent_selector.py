from django.db.models import Q

from agents.models import SubAgent
from accounts.models import OrganizationMembership


def list_sub_agents_for_user(user):
    user_org_ids = OrganizationMembership.objects.filter(
        user=user, is_active=True,
    ).values_list("organization_id", flat=True)

    return SubAgent.objects.filter(
        Q(organization_id__in=user_org_ids) | Q(organization__isnull=True)
    ).order_by("name")


def list_sub_agents_for_organization(organization):
    return SubAgent.objects.filter(
        Q(organization=organization) | Q(organization__isnull=True)
    ).order_by("name")


def get_sub_agent_by_slug(slug, organization=None):
    if organization is not None:
        return SubAgent.objects.filter(organization=organization, slug=slug).first()
    return SubAgent.objects.filter(slug=slug).first()


def get_sub_agent_by_id(sub_agent_id):
    return SubAgent.objects.filter(id=sub_agent_id).first()
