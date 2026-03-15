from accounts.models import OrganizationMembership
from notifications.registry import register
from notifications.types import NotificationData

ADMIN_ROLES = {"OWNER", "ADMIN"}


def _task_metadata(task):
    meta = {}
    if task.project_id:
        meta["project_id"] = str(task.project_id)
    if task.issue_id:
        meta["issue_id"] = str(task.issue_id)
    return meta


def _get_org_admins(organization):
    """Return admin/owner users for an organization."""
    return [
        m.user
        for m in OrganizationMembership.objects.filter(
            organization=organization,
            role__in=ADMIN_ROLES,
            is_active=True,
        ).select_related("user")
    ]


@register("agent_task.completed")
def handle_agent_task_completed(context):
    task = context["task"]
    return [NotificationData(
        recipient=task.created_by,
        organization=task.organization,
        event_type="agent_task.completed",
        actor=None,
        title=f"Tarea completada: {task.title}",
        target_type="agent_task",
        target_id=task.id,
        metadata=_task_metadata(task),
    )]


@register("agent_task.failed")
def handle_agent_task_failed(context):
    task = context["task"]
    return [NotificationData(
        recipient=task.created_by,
        organization=task.organization,
        event_type="agent_task.failed",
        actor=None,
        title=f"Tarea fallida: {task.title}",
        body=task.error or "",
        target_type="agent_task",
        target_id=task.id,
        metadata=_task_metadata(task),
    )]


@register("agent.connected")
def handle_agent_connected(context):
    agent = context["agent"]
    results = []
    for org in agent.organizations.all():
        for admin in _get_org_admins(org):
            results.append(NotificationData(
                recipient=admin,
                organization=org,
                event_type="agent.connected",
                actor=None,
                title=f"Agente {agent.name} se conectó",
                target_type="toony_agent",
                target_id=agent.id,
                metadata={},
            ))
    return results


@register("agent.disconnected")
def handle_agent_disconnected(context):
    agent = context["agent"]
    results = []
    for org in agent.organizations.all():
        for admin in _get_org_admins(org):
            results.append(NotificationData(
                recipient=admin,
                organization=org,
                event_type="agent.disconnected",
                actor=None,
                title=f"Agente {agent.name} se desconectó",
                target_type="toony_agent",
                target_id=agent.id,
                metadata={},
            ))
    return results
