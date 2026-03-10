from organizations.models import OrganizationSettings


def get_organization_settings(organization):
    return OrganizationSettings.objects.filter(
        organization=organization,
    ).first()
