from accounts.models import OrganizationMembership


def get_membership(user, organization):
    return (
        OrganizationMembership.objects.filter(
            user=user,
            organization=organization,
            is_active=True,
        )
        .select_related("user")
        .first()
    )


def list_organization_members(organization):
    return (
        OrganizationMembership.objects.filter(
            organization=organization,
            is_active=True,
        )
        .select_related("user")
        .order_by("-joined_at")
    )


def get_user_role(user, organization):
    membership = get_membership(user, organization)
    return membership.role if membership else None
