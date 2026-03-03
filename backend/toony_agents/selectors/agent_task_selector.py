from toony_agents.models import AgentTask, TaskEvent


def list_tasks_for_agent(toony_agent, *, organization=None):
    qs = AgentTask.objects.filter(toony_agent=toony_agent)
    if organization:
        qs = qs.filter(organization=organization)
    return qs.select_related("toony_agent", "created_by")


def get_task_by_id(task_id):
    return AgentTask.objects.filter(
        id=task_id,
    ).select_related("toony_agent", "created_by").first()


def list_task_events(task, *, after_sequence=None):
    qs = TaskEvent.objects.filter(task=task)
    if after_sequence is not None:
        qs = qs.filter(sequence__gt=after_sequence)
    return qs.order_by("sequence")
