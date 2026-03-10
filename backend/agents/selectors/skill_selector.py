from django.db.models import Q

from accounts.models import OrganizationMembership
from agents.models import Skill, SkillVersion


def list_skills_for_user(user):
    user_org_ids = OrganizationMembership.objects.filter(
        user=user,
        is_active=True,
    ).values_list("organization_id", flat=True)

    return Skill.objects.filter(Q(organization_id__in=user_org_ids) | Q(organization__isnull=True)).order_by("name")


def list_skills_for_organization(organization):
    return Skill.objects.filter(Q(organization=organization) | Q(organization__isnull=True)).order_by("name")


def get_skill_by_slug(slug, organization=None):
    if organization is not None:
        return Skill.objects.filter(organization=organization, slug=slug).first()
    return Skill.objects.filter(slug=slug).first()


def get_skill_by_id(skill_id):
    return Skill.objects.filter(id=skill_id).first()


def list_skill_versions(skill):
    return SkillVersion.objects.filter(skill=skill).order_by("-created_at")
