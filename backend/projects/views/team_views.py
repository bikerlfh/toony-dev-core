from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.selectors import get_user_by_email
from organizations.permissions import IsOrganizationAdmin, IsOrganizationMember
from projects.permissions import IsTeamAccessible
from projects.selectors import list_organization_teams, list_team_members, get_team_membership
from projects.serializers.input import (
    AddTeamMemberSerializer,
    CreateTeamSerializer,
    UpdateTeamMemberRoleSerializer,
    UpdateTeamSerializer,
)
from projects.serializers.output import (
    TeamDetailSerializer,
    TeamListSerializer,
    TeamMembershipSerializer,
)
from projects.services import (
    add_team_member,
    create_team,
    delete_team,
    remove_team_member,
    update_team,
    update_team_member_role,
)


class TeamListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), IsOrganizationAdmin()]
        return [IsAuthenticated(), IsOrganizationMember()]

    def get(self, request, org_slug):
        teams = list_organization_teams(request.organization)
        output = TeamListSerializer(teams, many=True).data
        return Response(output, status=status.HTTP_200_OK)

    def post(self, request, org_slug):
        serializer = CreateTeamSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        team = create_team(
            organization=request.organization,
            creator=request.user,
            **serializer.validated_data,
        )
        output = TeamDetailSerializer(team).data
        return Response(output, status=status.HTTP_201_CREATED)


class TeamDetailView(APIView):
    def get_permissions(self):
        if self.request.method == "DELETE":
            return [IsAuthenticated(), IsTeamAccessible()]
        if self.request.method == "PUT":
            return [IsAuthenticated(), IsTeamAccessible()]
        return [IsAuthenticated(), IsTeamAccessible()]

    def get(self, request, org_slug, team_slug):
        output = TeamDetailSerializer(request.team).data
        return Response(output, status=status.HTTP_200_OK)

    def put(self, request, org_slug, team_slug):
        serializer = UpdateTeamSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        team = update_team(request.team, **serializer.validated_data)
        output = TeamDetailSerializer(team).data
        return Response(output, status=status.HTTP_200_OK)

    def delete(self, request, org_slug, team_slug):
        delete_team(request.team)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TeamMemberListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), IsTeamAccessible()]
        return [IsAuthenticated(), IsTeamAccessible()]

    def get(self, request, org_slug, team_slug):
        members = list_team_members(request.team)
        output = TeamMembershipSerializer(members, many=True).data
        return Response(output, status=status.HTTP_200_OK)

    def post(self, request, org_slug, team_slug):
        serializer = AddTeamMemberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = get_user_by_email(serializer.validated_data["email"])
        if user is None:
            raise NotFound("No user found with this email.")

        membership = add_team_member(
            team=request.team,
            user=user,
            role=serializer.validated_data["role"],
        )
        output = TeamMembershipSerializer(membership).data
        return Response(output, status=status.HTTP_201_CREATED)


class TeamMemberDetailView(APIView):
    permission_classes = [IsAuthenticated, IsTeamAccessible]

    def _get_membership(self, team, user_id):
        from accounts.models import User

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            raise NotFound("User not found.")

        membership = get_team_membership(team, user)
        if membership is None:
            raise NotFound("Team membership not found.")
        return membership

    def put(self, request, org_slug, team_slug, user_id):
        membership = self._get_membership(request.team, user_id)
        serializer = UpdateTeamMemberRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        membership = update_team_member_role(
            membership, new_role=serializer.validated_data["role"],
        )
        output = TeamMembershipSerializer(membership).data
        return Response(output, status=status.HTTP_200_OK)

    def delete(self, request, org_slug, team_slug, user_id):
        membership = self._get_membership(request.team, user_id)
        remove_team_member(membership)
        return Response(status=status.HTTP_204_NO_CONTENT)
