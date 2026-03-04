import json

from common.exceptions import ConflictError
from agents.models import SubAgent
from agents.selectors import get_sub_agent_by_slug


def create_sub_agent(organization, created_by, name, slug, **kwargs):
    if get_sub_agent_by_slug(slug, organization=organization):
        raise ConflictError("A sub-agent with this slug already exists in this organization.")

    encrypted_configuration = kwargs.pop("encrypted_configuration", "")
    if encrypted_configuration and not isinstance(encrypted_configuration, str):
        encrypted_configuration = json.dumps(encrypted_configuration)

    return SubAgent.objects.create(
        organization=organization,
        created_by=created_by,
        name=name,
        slug=slug,
        encrypted_configuration=encrypted_configuration,
        **kwargs,
    )


def update_sub_agent(sub_agent, **kwargs):
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
            setattr(sub_agent, field, value)

    sub_agent.save()

    if assigned_projects is not None:
        sub_agent.assigned_projects.set(assigned_projects)

    return sub_agent


def delete_sub_agent(sub_agent):
    sub_agent.delete()
