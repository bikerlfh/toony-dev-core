from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.selectors import get_user_by_email
from common.mixins import PaginatedViewMixin
from workspace.permissions import IsWorkspaceAdmin, IsWorkspaceMember
from workspace.selectors import (
    get_team_by_slug,
    get_team_membership,
    list_team_members,
    list_teams,
)
from workspace.serializers.input import (
    AddTeamMemberSerializer,
    CreateTeamSerializer,
    UpdateTeamMemberRoleSerializer,
    UpdateTeamSerializer,
)
from workspace.serializers.output import (
    TeamDetailSerializer,
    TeamListSerializer,
    TeamMembershipSerializer,
)
from workspace.services import (
    add_team_member,
    create_team,
    delete_team,
    remove_team_member,
    update_team,
    update_team_member_role,
)


class TeamListCreateView(PaginatedViewMixin, APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), IsWorkspaceAdmin()]
        return [IsAuthenticated(), IsWorkspaceMember()]

    def get(self, request):
        search = request.query_params.get("q")
        teams = list_teams(search=search)
        return self.paginate(teams, TeamListSerializer, request)

    def post(self, request):
        serializer = CreateTeamSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        team = create_team(creator=request.user, **serializer.validated_data)
        output = TeamDetailSerializer(team).data
        return Response(output, status=status.HTTP_201_CREATED)


class TeamDetailView(APIView):
    def get_permissions(self):
        if self.request.method == "GET":
            return [IsAuthenticated(), IsWorkspaceMember()]
        return [IsAuthenticated(), IsWorkspaceAdmin()]

    def _get_team(self, team_slug):
        team = get_team_by_slug(team_slug)
        if team is None:
            raise NotFound("Team not found.")
        return team

    def get(self, request, team_slug):
        team = self._get_team(team_slug)
        output = TeamDetailSerializer(team).data
        return Response(output, status=status.HTTP_200_OK)

    def put(self, request, team_slug):
        team = self._get_team(team_slug)
        serializer = UpdateTeamSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        team = update_team(team, **serializer.validated_data)
        output = TeamDetailSerializer(team).data
        return Response(output, status=status.HTTP_200_OK)

    def delete(self, request, team_slug):
        team = self._get_team(team_slug)
        delete_team(team)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TeamMemberListCreateView(PaginatedViewMixin, APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), IsWorkspaceAdmin()]
        return [IsAuthenticated(), IsWorkspaceMember()]

    def _get_team(self, team_slug):
        team = get_team_by_slug(team_slug)
        if team is None:
            raise NotFound("Team not found.")
        return team

    def get(self, request, team_slug):
        team = self._get_team(team_slug)
        members = list_team_members(team)
        return self.paginate(members, TeamMembershipSerializer, request)

    def post(self, request, team_slug):
        team = self._get_team(team_slug)
        serializer = AddTeamMemberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = get_user_by_email(serializer.validated_data["email"])
        if user is None:
            raise NotFound("No user found with this email.")

        membership = add_team_member(
            team=team,
            user=user,
            role=serializer.validated_data["role"],
        )
        output = TeamMembershipSerializer(membership).data
        return Response(output, status=status.HTTP_201_CREATED)


class TeamMemberDetailView(APIView):
    permission_classes = [IsAuthenticated, IsWorkspaceAdmin]

    def _get_team_and_membership(self, team_slug, user_id):
        from accounts.models import User

        team = get_team_by_slug(team_slug)
        if team is None:
            raise NotFound("Team not found.")

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            raise NotFound("User not found.")

        membership = get_team_membership(team, user)
        if membership is None:
            raise NotFound("Team membership not found.")
        return membership

    def put(self, request, team_slug, user_id):
        membership = self._get_team_and_membership(team_slug, user_id)
        serializer = UpdateTeamMemberRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        membership = update_team_member_role(
            membership, new_role=serializer.validated_data["role"],
        )
        output = TeamMembershipSerializer(membership).data
        return Response(output, status=status.HTTP_200_OK)

    def delete(self, request, team_slug, user_id):
        membership = self._get_team_and_membership(team_slug, user_id)
        remove_team_member(membership)
        return Response(status=status.HTTP_204_NO_CONTENT)
