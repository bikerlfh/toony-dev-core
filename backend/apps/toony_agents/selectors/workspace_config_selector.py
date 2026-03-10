from toony_agents.models import ToonyAgent


def get_agent_workspace_config(agent_id):
    """Build the config.sync payload for a given agent.

    Returns a list of org dicts with nested projects, ready to be sent
    as the ``organizations`` field in a config.sync message.
    """
    try:
        agent = ToonyAgent.objects.prefetch_related(
            "organizations__projects__settings",
            "organizations__projects__memberships__user",
            "organizations__integration_configs",
        ).get(id=agent_id)
    except ToonyAgent.DoesNotExist:
        return []

    result = []
    for org in agent.organizations.all():
        # Build integrations from IntegrationConfig.
        integrations = {}
        for ic in org.integration_configs.filter(is_active=True):
            provider = ic.provider.lower()
            integrations["pm"] = provider

        # Build project list.
        projects = []
        for proj in org.projects.all():
            settings = getattr(proj, "settings", None)
            reviewers = []
            if settings:
                reviewer_memberships = proj.memberships.filter(role="REVIEWER")
                reviewers = [m.user.email for m in reviewer_memberships.select_related("user")]

            projects.append(
                {
                    "id": str(proj.id),
                    "name": proj.name,
                    "slug": proj.slug,
                    "repository_url": settings.repository_url if settings else "",
                    "base_branch": settings.default_branch if settings else "main",
                    "branch_convention": settings.branch_naming_convention if settings else "",
                    "default_reviewers": reviewers,
                    "issue_prefix": settings.issue_prefix if settings else "",
                }
            )

        result.append(
            {
                "id": str(org.id),
                "name": org.name,
                "slug": org.slug,
                "integrations": integrations,
                "defaults": {
                    "base_branch": "main",
                    "branch_convention": "",
                    "default_reviewers": [],
                },
                "projects": projects,
            }
        )

    return result
