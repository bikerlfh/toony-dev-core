from workspace.models import ProjectTeam


def list_project_teams(project):
    return ProjectTeam.objects.filter(
        project=project,
    ).select_related("team")


def get_project_team(project, team):
    return ProjectTeam.objects.filter(
        project=project,
        team=team,
    ).first()
