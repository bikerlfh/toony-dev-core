from toony_agents.models import AgentSystemEvent


def list_system_events_for_agent(toony_agent, *, event_type=None, project_id=None):
    qs = AgentSystemEvent.objects.filter(toony_agent=toony_agent)
    if event_type:
        qs = qs.filter(event_type=event_type)
    if project_id:
        qs = qs.filter(project_id=project_id)
    return qs.select_related("organization", "project")
