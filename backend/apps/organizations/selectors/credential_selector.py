from organizations.models import RepositoryCredential


def list_organization_credentials(organization):
    return RepositoryCredential.objects.filter(organization=organization).order_by("name")


def get_credential_by_id(organization, credential_id):
    return RepositoryCredential.objects.filter(organization=organization, id=credential_id).first()
