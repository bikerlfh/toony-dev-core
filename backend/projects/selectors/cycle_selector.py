from projects.models import Cycle


def list_project_cycles(project):
    return Cycle.objects.filter(
        project=project,
    ).order_by("-number")


def get_cycle_by_id(project, cycle_id):
    return Cycle.objects.filter(
        project=project,
        id=cycle_id,
    ).first()


def get_next_cycle_number(project):
    last = Cycle.objects.filter(project=project).order_by("-number").first()
    return (last.number + 1) if last else 1
