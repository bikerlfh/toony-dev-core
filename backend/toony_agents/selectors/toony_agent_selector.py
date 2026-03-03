from toony_agents.models import ToonyAgent, ToonyAgentKey


def list_toony_agents_for_organization(organization):
    return ToonyAgent.objects.filter(
        organizations=organization,
    ).prefetch_related("organizations")


def get_toony_agent_by_slug(slug):
    return ToonyAgent.objects.filter(slug=slug).first()


def get_toony_agent_by_id(agent_id):
    return ToonyAgent.objects.filter(id=agent_id).first()


def list_agent_keys(toony_agent):
    return ToonyAgentKey.objects.filter(
        toony_agent=toony_agent,
    ).select_related("created_by")
