from common.exceptions import ConflictError
from agents.models import AgentSkill


def assign_skill(agent, skill, priority=0, custom_config=None):
    if AgentSkill.objects.filter(agent=agent, skill=skill).exists():
        raise ConflictError("This skill is already assigned to this agent.")

    return AgentSkill.objects.create(
        agent=agent,
        skill=skill,
        priority=priority,
        custom_config=custom_config,
    )


def update_agent_skill(agent_skill, **kwargs):
    allowed_fields = {"priority", "is_enabled", "custom_config"}
    for field, value in kwargs.items():
        if field in allowed_fields:
            setattr(agent_skill, field, value)
    agent_skill.save()
    return agent_skill


def remove_agent_skill(agent_skill):
    agent_skill.delete()
