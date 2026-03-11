from django.db import transaction
from django.utils import timezone

from common.broadcast import broadcast
from toony_agents.models import AgentTask, AgentTaskStatus, TaskEvent


def create_agent_task(organization, toony_agent, created_by, title, prompt, project=None):
    with transaction.atomic():
        task = AgentTask.objects.create(
            organization=organization,
            toony_agent=toony_agent,
            title=title,
            prompt=prompt,
            created_by=created_by,
            project=project,
        )
    broadcast(
        f"toony_agent_{toony_agent.id}",
        "task_status",
        {"task_id": str(task.id), "status": task.status},
    )
    # Notify runner so it picks up the task immediately
    assign_data = {"task_id": str(task.id), "prompt": task.prompt, "title": task.title}
    if task.project_id:
        assign_data["project_id"] = str(task.project_id)
    broadcast(
        f"toony_agent_runner_{toony_agent.id}",
        "task_assign",
        assign_data,
    )
    return task


def update_task_status(task, new_status, **kwargs):
    task.status = new_status
    if new_status == AgentTaskStatus.RUNNING and not task.started_at:
        task.started_at = timezone.now()
    if new_status in (AgentTaskStatus.COMPLETED, AgentTaskStatus.FAILED, AgentTaskStatus.CANCELLED):
        task.completed_at = timezone.now()
    if "result" in kwargs:
        task.result = kwargs["result"]
    if "error" in kwargs:
        task.error = kwargs["error"]
    task.save()
    broadcast(
        f"toony_agent_{task.toony_agent_id}",
        "task_status",
        {"task_id": str(task.id), "status": task.status},
    )
    return task


def create_task_event(task, event_type, data, sequence):
    event = TaskEvent.objects.create(
        task=task,
        event_type=event_type,
        data=data,
        sequence=sequence,
    )
    broadcast(
        f"toony_agent_{task.toony_agent_id}",
        "task_event",
        {"task_id": str(task.id), "event_type": event_type, "data": data, "sequence": sequence},
    )
    return event
