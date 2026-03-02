import json

from common.exceptions import ConflictError
from agents.models import Agent
from agents.selectors import get_agent_by_slug


def create_agent(organization, created_by, name, slug, **kwargs):
    if get_agent_by_slug(slug, organization=organization):
        raise ConflictError("An agent with this slug already exists in this organization.")

    encrypted_configuration = kwargs.pop("encrypted_configuration", "")
    if encrypted_configuration and not isinstance(encrypted_configuration, str):
        encrypted_configuration = json.dumps(encrypted_configuration)

    return Agent.objects.create(
        organization=organization,
        created_by=created_by,
        name=name,
        slug=slug,
        encrypted_configuration=encrypted_configuration,
        **kwargs,
    )


def update_agent(agent, **kwargs):
    allowed_fields = {
        "name", "description", "markdown", "version", "status", "agent_type",
        "capabilities", "encrypted_configuration", "is_external", "external_command",
        "tags",
    }

    assigned_projects = kwargs.pop("assigned_projects", None)

    for field, value in kwargs.items():
        if field in allowed_fields:
            if field == "encrypted_configuration" and not isinstance(value, str):
                value = json.dumps(value)
            setattr(agent, field, value)

    agent.save()

    if assigned_projects is not None:
        agent.assigned_projects.set(assigned_projects)

    return agent


def delete_agent(agent):
    agent.delete()
