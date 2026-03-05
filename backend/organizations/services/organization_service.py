from django.db import transaction

from accounts.models import MembershipRole, OrganizationMembership
from common.exceptions import ConflictError
from organizations.models import Organization, OrganizationSettings
from organizations.selectors import get_organization_by_slug


def create_organization(name, slug, owner, **kwargs):
    if get_organization_by_slug(slug):
        raise ConflictError("An organization with this slug already exists.")

    with transaction.atomic():
        organization = Organization.objects.create(
            name=name,
            slug=slug,
            **kwargs,
        )
        OrganizationSettings.objects.create(organization=organization)
        OrganizationMembership.objects.create(
            user=owner,
            organization=organization,
            role=MembershipRole.OWNER,
        )

    return organization


def update_organization(organization, **kwargs):
    allowed_fields = {"name", "description", "logo", "website", "industry", "is_active"}
    for field, value in kwargs.items():
        if field in allowed_fields:
            setattr(organization, field, value)
    organization.save()
    return organization


def delete_organization(organization):
    organization.is_active = False
    organization.save()
    return organization
