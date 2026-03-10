from projects.models import Milestone


def list_project_milestones(project):
    return Milestone.objects.filter(
        project=project,
    ).order_by("sort_order", "-created_at")


def get_milestone_by_id(project, milestone_id):
    return Milestone.objects.filter(
        project=project,
        id=milestone_id,
    ).first()
