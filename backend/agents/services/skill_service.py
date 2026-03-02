from common.exceptions import ConflictError
from agents.models import Skill, SkillVersion
from agents.selectors import get_skill_by_slug


def create_skill(organization, created_by, name, slug, **kwargs):
    if get_skill_by_slug(organization, slug):
        raise ConflictError("A skill with this slug already exists in this organization.")

    skill = Skill.objects.create(
        organization=organization,
        created_by=created_by,
        name=name,
        slug=slug,
        **kwargs,
    )

    if skill.content:
        SkillVersion.objects.create(
            skill=skill,
            version=skill.version,
            content=skill.content,
            changelog="Initial version",
            created_by=created_by,
        )

    return skill


def update_skill(skill, updated_by=None, **kwargs):
    allowed_fields = {
        "name", "description", "version", "status", "content",
        "category", "input_schema", "output_schema", "compatible_agent_types",
        "is_external", "external_command", "tags",
    }

    content_changed = False
    new_content = kwargs.get("content")
    if new_content is not None and new_content != skill.content:
        content_changed = True

    for field, value in kwargs.items():
        if field in allowed_fields:
            setattr(skill, field, value)

    skill.save()

    if content_changed:
        SkillVersion.objects.create(
            skill=skill,
            version=skill.version,
            content=skill.content,
            changelog=kwargs.get("changelog", ""),
            created_by=updated_by,
        )

    return skill


def delete_skill(skill):
    skill.delete()
