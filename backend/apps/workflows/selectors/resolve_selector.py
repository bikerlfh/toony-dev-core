from django.db.models import Count, Q

from workflows.models import Workflow


SCOPED_EAGER_LOADING = {
    "select_related": ["organization", "project", "created_by"],
    "prefetch_related": ["nodes__sub_agent", "nodes__skill", "edges", "labels"],
}


def _build_scopes(project, organization):
    return [
        {"project": project},
        {"organization": organization},
        {"organization__isnull": True, "project__isnull": True},
    ]


def _find_best_label_match(scope_filter, issue_label_ids):
    """Find the active workflow with the most label matches within a scope."""
    return (
        Workflow.objects.filter(is_active=True, **scope_filter)
        .filter(labels__id__in=issue_label_ids)
        .annotate(
            match_count=Count(
                "labels", filter=Q(labels__id__in=issue_label_ids)
            )
        )
        .select_related(*SCOPED_EAGER_LOADING["select_related"])
        .prefetch_related(*SCOPED_EAGER_LOADING["prefetch_related"])
        .order_by("-match_count")
        .first()
    )


def _find_default_workflow(scopes):
    """Find an active workflow with no labels (default) across scopes."""
    for scope_filter in scopes:
        wf = (
            Workflow.objects.filter(is_active=True, **scope_filter)
            .filter(labels__isnull=True)
            .select_related(*SCOPED_EAGER_LOADING["select_related"])
            .prefetch_related(*SCOPED_EAGER_LOADING["prefetch_related"])
            .first()
        )
        if wf:
            return wf
    return None


def resolve_workflow_for_issue(issue):
    """
    Resolve the best workflow for an issue.

    Resolution order (by scope: project -> org -> global):
    1. Workflows whose labels overlap with issue labels, ranked by match count
    2. Default workflows (no labels assigned)
    """
    project = issue.project
    organization = project.organization
    scopes = _build_scopes(project, organization)

    issue_label_ids = set(issue.labels.values_list("id", flat=True))

    if issue_label_ids:
        for scope_filter in scopes:
            workflow = _find_best_label_match(scope_filter, issue_label_ids)
            if workflow:
                return workflow

    return _find_default_workflow(scopes)
