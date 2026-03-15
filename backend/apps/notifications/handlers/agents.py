from notifications.registry import register
from notifications.types import NotificationData


def _task_metadata(task):
    meta = {}
    if task.project_id:
        meta["project_id"] = str(task.project_id)
    if task.issue_id:
        meta["issue_id"] = str(task.issue_id)
    return meta


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
