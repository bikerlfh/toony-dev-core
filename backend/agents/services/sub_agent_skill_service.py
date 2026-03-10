from agents.models import SubAgentSkill
from common.exceptions import ConflictError


def assign_skill(sub_agent, skill, priority=0, custom_config=None):
    if SubAgentSkill.objects.filter(sub_agent=sub_agent, skill=skill).exists():
        raise ConflictError("This skill is already assigned to this sub-agent.")

    return SubAgentSkill.objects.create(
        sub_agent=sub_agent,
        skill=skill,
        priority=priority,
        custom_config=custom_config,
    )


def update_sub_agent_skill(sub_agent_skill, **kwargs):
    allowed_fields = {"priority", "is_enabled", "custom_config"}
    for field, value in kwargs.items():
        if field in allowed_fields:
            setattr(sub_agent_skill, field, value)
    sub_agent_skill.save()
    return sub_agent_skill


def remove_sub_agent_skill(sub_agent_skill):
    sub_agent_skill.delete()
