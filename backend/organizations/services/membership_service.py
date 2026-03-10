from rest_framework.exceptions import ValidationError

from accounts.models import MembershipRole, OrganizationMembership
from common.exceptions import ConflictError


def add_member(organization, user, role, invited_by=None):
    existing = OrganizationMembership.objects.filter(
        user=user,
        organization=organization,
    ).first()

    if existing and existing.is_active:
        raise ConflictError("User is already a member of this organization.")

    if existing and not existing.is_active:
        existing.is_active = True
        existing.role = role
        existing.invited_by = invited_by
        existing.save()
        return existing

    return OrganizationMembership.objects.create(
        user=user,
        organization=organization,
        role=role,
        invited_by=invited_by,
    )


def update_member_role(membership, new_role):
    if membership.role == MembershipRole.OWNER and new_role != MembershipRole.OWNER:
        owner_count = OrganizationMembership.objects.filter(
            organization=membership.organization,
            role=MembershipRole.OWNER,
            is_active=True,
        ).count()
        if owner_count <= 1:
            raise ValidationError("Cannot change role of the last owner. Assign another owner first.")

    membership.role = new_role
    membership.save()
    return membership


def remove_member(membership):
    if membership.role == MembershipRole.OWNER:
        owner_count = OrganizationMembership.objects.filter(
            organization=membership.organization,
            role=MembershipRole.OWNER,
            is_active=True,
        ).count()
        if owner_count <= 1:
            raise ValidationError("Cannot remove the last owner. Assign another owner first.")

    membership.is_active = False
    membership.save()
    return membership
