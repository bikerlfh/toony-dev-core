from agents.models import AgentSkill


def list_agent_skills(agent):
    return AgentSkill.objects.filter(agent=agent).select_related("skill").order_by("priority")


def get_agent_skill_by_id(agent, agent_skill_id):
    return AgentSkill.objects.filter(agent=agent, id=agent_skill_id).select_related("skill").first()
