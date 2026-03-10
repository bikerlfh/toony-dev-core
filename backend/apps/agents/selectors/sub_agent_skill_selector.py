from agents.models import SubAgentSkill


def list_sub_agent_skills(sub_agent):
    return SubAgentSkill.objects.filter(sub_agent=sub_agent).select_related("skill").order_by("priority")


def get_sub_agent_skill_by_id(sub_agent, sub_agent_skill_id):
    return SubAgentSkill.objects.filter(sub_agent=sub_agent, id=sub_agent_skill_id).select_related("skill").first()
