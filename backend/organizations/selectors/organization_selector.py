from organizations.models import Organization


def get_organization_by_slug(slug):
    return Organization.objects.filter(slug=slug, is_active=True).first()


def get_organization_by_id(org_id):
    return Organization.objects.filter(id=org_id, is_active=True).first()


def list_user_organizations(user):
    return Organization.objects.filter(
        memberships__user=user,
        memberships__is_active=True,
    ).distinct().order_by("-is_active", "-created_at")
