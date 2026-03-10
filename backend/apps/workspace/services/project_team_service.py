from common.exceptions import ConflictError
from workspace.models import ProjectTeam


def add_project_team(project, team):
    existing = ProjectTeam.objects.filter(project=project, team=team).first()
    if existing:
        raise ConflictError("Team is already associated with this project.")
    return ProjectTeam.objects.create(project=project, team=team)


def remove_project_team(project_team):
    project_team.delete()
