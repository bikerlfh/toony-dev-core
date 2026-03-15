from notifications.registry import register
from notifications.types import NotificationData


@register("project.member_added")
def handle_project_member_added(context):
    project = context["project"]
    member = context["member"]
    actor = context["actor"]

    if member == actor:
        return []

    return [NotificationData(
        recipient=member,
        organization=project.organization,
        event_type="project.member_added",
        actor=actor,
        title=f"Te agregaron al proyecto {project.name}",
        target_type="project",
        target_id=project.id,
        metadata={},
    )]


@register("project.member_removed")
def handle_project_member_removed(context):
    project = context["project"]
    member = context["member"]
    actor = context["actor"]

    if member == actor:
        return []

    return [NotificationData(
        recipient=member,
        organization=project.organization,
        event_type="project.member_removed",
        actor=actor,
        title=f"Te removieron del proyecto {project.name}",
        target_type="project",
        target_id=project.id,
        metadata={},
    )]
