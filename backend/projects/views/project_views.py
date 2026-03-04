from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.selectors import get_user_by_email
from common.mixins import PaginatedViewMixin
from organizations.permissions import IsOrganizationAdmin, IsOrganizationManager, IsOrganizationMember
from projects.permissions import IsProjectAccessible
from projects.selectors import (
    get_project_settings,
    list_organization_projects,
    list_project_members,
    get_project_membership,
)
from projects.serializers.input import (
    AddProjectMemberSerializer,
    CreateProjectSerializer,
    UpdateProjectMemberRoleSerializer,
    UpdateProjectSerializer,
    UpdateProjectSettingsSerializer,
)
from projects.serializers.output import (
    ProjectDetailSerializer,
    ProjectListSerializer,
    ProjectMembershipSerializer,
    ProjectSettingsSerializer,
)
from projects.services import (
    add_project_member,
    create_project,
    delete_project,
    remove_project_member,
    update_project,
    update_project_member_role,
    update_project_settings,
)


class ProjectListCreateView(PaginatedViewMixin, APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), IsOrganizationManager()]
        return [IsAuthenticated(), IsOrganizationMember()]

    def get(self, request, org_slug):
        search = request.query_params.get("q")
        projects = list_organization_projects(request.organization, search=search)
        return self.paginate(projects, ProjectListSerializer, request)

    def post(self, request, org_slug):
        serializer = CreateProjectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        project = create_project(
            organization=request.organization,
            creator=request.user,
            **serializer.validated_data,
        )
        output = ProjectDetailSerializer(project).data
        return Response(output, status=status.HTTP_201_CREATED)


class ProjectDetailView(APIView):
    def get_permissions(self):
        if self.request.method == "DELETE":
            return [IsAuthenticated(), IsProjectAccessible()]
        if self.request.method == "PUT":
            return [IsAuthenticated(), IsProjectAccessible()]
        return [IsAuthenticated(), IsProjectAccessible()]

    def get(self, request, org_slug, project_slug):
        output = ProjectDetailSerializer(request.project).data
        return Response(output, status=status.HTTP_200_OK)

    def put(self, request, org_slug, project_slug):
        serializer = UpdateProjectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        project = update_project(request.project, **serializer.validated_data)
        output = ProjectDetailSerializer(project).data
        return Response(output, status=status.HTTP_200_OK)

    def delete(self, request, org_slug, project_slug):
        delete_project(request.project)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectMemberListCreateView(PaginatedViewMixin, APIView):
    def get_permissions(self):
        return [IsAuthenticated(), IsProjectAccessible()]

    def get(self, request, org_slug, project_slug):
        members = list_project_members(request.project)
        return self.paginate(members, ProjectMembershipSerializer, request)

    def post(self, request, org_slug, project_slug):
        serializer = AddProjectMemberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = get_user_by_email(serializer.validated_data["email"])
        if user is None:
            raise NotFound("No user found with this email.")

        membership = add_project_member(
            project=request.project,
            user=user,
            role=serializer.validated_data["role"],
        )
        output = ProjectMembershipSerializer(membership).data
        return Response(output, status=status.HTTP_201_CREATED)


class ProjectMemberDetailView(APIView):
    permission_classes = [IsAuthenticated, IsProjectAccessible]

    def _get_membership(self, project, user_id):
        from accounts.models import User

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            raise NotFound("User not found.")

        membership = get_project_membership(project, user)
        if membership is None:
            raise NotFound("Project membership not found.")
        return membership

    def put(self, request, org_slug, project_slug, user_id):
        membership = self._get_membership(request.project, user_id)
        serializer = UpdateProjectMemberRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        membership = update_project_member_role(
            membership, new_role=serializer.validated_data["role"],
        )
        output = ProjectMembershipSerializer(membership).data
        return Response(output, status=status.HTTP_200_OK)

    def delete(self, request, org_slug, project_slug, user_id):
        membership = self._get_membership(request.project, user_id)
        remove_project_member(membership)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectSettingsView(APIView):
    def get_permissions(self):
        if self.request.method == "PUT":
            return [IsAuthenticated(), IsProjectAccessible()]
        return [IsAuthenticated(), IsProjectAccessible()]

    def get(self, request, org_slug, project_slug):
        settings_obj = get_project_settings(request.project)
        if settings_obj is None:
            raise NotFound("Project settings not found.")
        output = ProjectSettingsSerializer(settings_obj).data
        return Response(output, status=status.HTTP_200_OK)

    def put(self, request, org_slug, project_slug):
        settings_obj = get_project_settings(request.project)
        if settings_obj is None:
            raise NotFound("Project settings not found.")

        serializer = UpdateProjectSettingsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        settings_obj = update_project_settings(
            settings_obj, **serializer.validated_data,
        )
        output = ProjectSettingsSerializer(settings_obj).data
        return Response(output, status=status.HTTP_200_OK)
