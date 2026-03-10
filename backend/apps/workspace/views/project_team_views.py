from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.mixins import PaginatedViewMixin
from projects.permissions import IsProjectAccessible
from workspace.models import Team
from workspace.selectors import get_project_team, list_project_teams
from workspace.serializers.input import AddProjectTeamSerializer
from workspace.serializers.output import ProjectTeamSerializer
from workspace.services import add_project_team, remove_project_team


class ProjectTeamListCreateView(PaginatedViewMixin, APIView):
    def get_permissions(self):
        return [IsAuthenticated(), IsProjectAccessible()]

    def get(self, request, project_id):
        project_teams = list_project_teams(request.project)
        return self.paginate(project_teams, ProjectTeamSerializer, request)

    def post(self, request, project_id):
        serializer = AddProjectTeamSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            team = Team.objects.get(
                id=serializer.validated_data["team_id"],
                is_active=True,
            )
        except Team.DoesNotExist:
            raise NotFound("Team not found.")

        pt = add_project_team(project=request.project, team=team)
        output = ProjectTeamSerializer(pt).data
        return Response(output, status=status.HTTP_201_CREATED)


class ProjectTeamDetailView(APIView):
    permission_classes = [IsAuthenticated, IsProjectAccessible]

    def delete(self, request, project_id, team_id):
        try:
            team = Team.objects.get(id=team_id, is_active=True)
        except Team.DoesNotExist:
            raise NotFound("Team not found.")

        pt = get_project_team(request.project, team)
        if pt is None:
            raise NotFound("Team is not associated with this project.")

        remove_project_team(pt)
        return Response(status=status.HTTP_204_NO_CONTENT)
