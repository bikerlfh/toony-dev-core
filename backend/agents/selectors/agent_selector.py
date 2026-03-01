from agents.models import Agent


def list_organization_agents(organization):
    return Agent.objects.filter(organization=organization).order_by("name")


def get_agent_by_slug(organization, slug):
    return Agent.objects.filter(organization=organization, slug=slug).first()


def get_agent_by_id(organization, agent_id):
    return Agent.objects.filter(organization=organization, id=agent_id).first()
