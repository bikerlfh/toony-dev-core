from agents.models import Skill, SkillVersion


def list_organization_skills(organization):
    return Skill.objects.filter(organization=organization).order_by("name")


def get_skill_by_slug(organization, slug):
    return Skill.objects.filter(organization=organization, slug=slug).first()


def get_skill_by_id(organization, skill_id):
    return Skill.objects.filter(organization=organization, id=skill_id).first()


def list_skill_versions(skill):
    return SkillVersion.objects.filter(skill=skill).order_by("-created_at")
