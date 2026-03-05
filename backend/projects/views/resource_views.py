from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.mixins import PaginatedViewMixin
from projects.permissions import IsProjectAccessible
from projects.selectors import get_resource_by_id, list_project_resources
from projects.serializers.input import (
    CreateProjectResourceSerializer,
    UpdateProjectResourceSerializer,
)
from projects.serializers.output import ProjectResourceSerializer
from projects.services import create_resource, delete_resource, update_resource


class ResourceListCreateView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated, IsProjectAccessible]

    def get(self, request, project_id):
        resources = list_project_resources(request.project)
        return self.paginate(resources, ProjectResourceSerializer, request)

    def post(self, request, project_id):
        serializer = CreateProjectResourceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        resource = create_resource(
            project=request.project, **serializer.validated_data,
        )
        output = ProjectResourceSerializer(resource).data
        return Response(output, status=status.HTTP_201_CREATED)


class ResourceDetailView(APIView):
    permission_classes = [IsAuthenticated, IsProjectAccessible]

    def _get_resource(self, project, resource_id):
        resource = get_resource_by_id(project, resource_id)
        if resource is None:
            raise NotFound("Resource not found.")
        return resource

    def get(self, request, project_id, resource_id):
        resource = self._get_resource(request.project, resource_id)
        output = ProjectResourceSerializer(resource).data
        return Response(output, status=status.HTTP_200_OK)

    def put(self, request, project_id, resource_id):
        resource = self._get_resource(request.project, resource_id)
        serializer = UpdateProjectResourceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        resource = update_resource(resource, **serializer.validated_data)
        output = ProjectResourceSerializer(resource).data
        return Response(output, status=status.HTTP_200_OK)

    def delete(self, request, project_id, resource_id):
        resource = self._get_resource(request.project, resource_id)
        delete_resource(resource)
        return Response(status=status.HTTP_204_NO_CONTENT)
