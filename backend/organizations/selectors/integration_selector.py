from organizations.models import IntegrationConfig


def list_organization_integrations(organization):
    return IntegrationConfig.objects.filter(organization=organization).order_by("provider")


def get_integration_by_id(organization, integration_id):
    return IntegrationConfig.objects.filter(organization=organization, id=integration_id).first()
