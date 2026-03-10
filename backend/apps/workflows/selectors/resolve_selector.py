from workflows.models import Workflow


def _find_active_workflow(scope_filter, label=None):
    """Find an active workflow matching a scope filter and optional label."""
    qs = Workflow.objects.filter(is_active=True, **scope_filter)
    if label:
        qs = qs.filter(label=label)
    else:
        qs = qs.filter(label__isnull=True)
    return (
        qs.select_related("organization", "project", "issue", "label", "created_by")
        .prefetch_related("nodes__sub_agent", "nodes__skill", "edges")
        .first()
    )


def resolve_workflow_for_issue(issue):
    """
    Resolve the best workflow for an issue.

    Resolution order:
    1. Pass 1: For each issue label (in order), check scopes Issue -> Project -> Org -> Global
    2. Pass 2: Check default (no label) at each scope
    """
    project = issue.project
    organization = project.organization

    scopes = [
        {"issue": issue},
        {"project": project},
        {"organization": organization},
        {"organization__isnull": True, "project__isnull": True, "issue__isnull": True},
    ]

    # Pass 1: Match by label
    labels = list(issue.labels.all().order_by("name"))
    for label in labels:
        for scope_filter in scopes:
            workflow = _find_active_workflow(scope_filter, label=label)
            if workflow:
                return workflow

    # Pass 2: Default (no label)
    for scope_filter in scopes:
        workflow = _find_active_workflow(scope_filter, label=None)
        if workflow:
            return workflow

    return None
