import json

from django.utils import timezone

from importers.models import ImportJob, ImportJobStatus, ImportMapping
from importers.plugins.registry import get_plugin
from organizations.models import IntegrationConfig
from projects.models import Label
from projects.services.issue_service import create_issue


STATUS_MAP = {
    "Backlog": "BACKLOG",
    "Todo": "TODO",
    "In Progress": "IN_PROGRESS",
    "In Review": "IN_REVIEW",
    "Done": "DONE",
    "Canceled": "CANCELED",
    "Cancelled": "CANCELED",
}

PRIORITY_MAP = {
    "URGENT": "URGENT",
    "HIGH": "HIGH",
    "MEDIUM": "MEDIUM",
    "LOW": "LOW",
    "NONE": "NONE",
}


def _get_credentials(organization, provider):
    integration = IntegrationConfig.objects.filter(
        organization=organization,
        provider=provider,
        is_active=True,
    ).first()
    if integration is None:
        return None

    raw = integration.encrypted_credentials
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {"api_key": raw}


def list_external_projects(organization, provider):
    plugin = get_plugin(provider)
    credentials = _get_credentials(organization, provider)
    if credentials is None:
        return []
    if not plugin.authenticate(credentials):
        return []
    return plugin.list_projects()


def start_import(organization, started_by, provider, external_project_id, target_project, config=None):
    import_job = ImportJob.objects.create(
        organization=organization,
        target_project=target_project,
        provider=provider,
        status=ImportJobStatus.PENDING,
        config=config or {},
        started_by=started_by,
    )

    credentials = _get_credentials(organization, provider)
    if credentials is None:
        import_job.status = ImportJobStatus.FAILED
        import_job.error_log = [{"error": "No active integration config found for this provider."}]
        import_job.save()
        return import_job

    plugin = get_plugin(provider)
    if not plugin.authenticate(credentials):
        import_job.status = ImportJobStatus.FAILED
        import_job.error_log = [{"error": "Authentication failed with provider."}]
        import_job.save()
        return import_job

    _run_import(import_job, plugin, external_project_id, started_by)
    return import_job


def _run_import(import_job, plugin, external_project_id, user):
    import_job.status = ImportJobStatus.IN_PROGRESS
    import_job.started_at = timezone.now()
    import_job.save()

    project = import_job.target_project
    if project is None:
        import_job.status = ImportJobStatus.FAILED
        import_job.error_log = [{"error": "Target project is required."}]
        import_job.completed_at = timezone.now()
        import_job.save()
        return

    errors = []
    external_issues = plugin.fetch_issues(external_project_id)
    import_job.total_items = len(external_issues)
    import_job.save()

    imported_count = 0
    label_cache = {}

    for i, ext_issue in enumerate(external_issues):
        try:
            label_ids = []
            for label_name in ext_issue.labels:
                if label_name not in label_cache:
                    label_obj, _ = Label.objects.get_or_create(
                        organization=import_job.organization,
                        name=label_name,
                        defaults={"color": "#6b7280"},
                    )
                    label_cache[label_name] = label_obj.id
                label_ids.append(label_cache[label_name])

            status = STATUS_MAP.get(ext_issue.status, "BACKLOG")
            priority = PRIORITY_MAP.get(ext_issue.priority, "NONE")

            issue = create_issue(
                project=project,
                reporter=user,
                title=ext_issue.title,
                description=ext_issue.description,
                status=status,
                priority=priority,
                label_ids=label_ids,
                external_tracker_name=import_job.provider,
                external_tracker_id=ext_issue.id,
            )

            ImportMapping.objects.create(
                import_job=import_job,
                external_id=ext_issue.id,
                external_type="issue",
                internal_id=issue.id,
                internal_type="Issue",
            )

            imported_count += 1
        except Exception as exc:
            errors.append({
                "external_id": ext_issue.id,
                "title": ext_issue.title,
                "error": str(exc),
            })

        import_job.imported_items = imported_count
        import_job.progress = int(((i + 1) / max(len(external_issues), 1)) * 100)
        import_job.save()

    import_job.completed_at = timezone.now()
    import_job.error_log = errors

    if errors and imported_count == 0:
        import_job.status = ImportJobStatus.FAILED
    elif errors:
        import_job.status = ImportJobStatus.PARTIALLY_COMPLETED
    else:
        import_job.status = ImportJobStatus.COMPLETED

    import_job.save()
