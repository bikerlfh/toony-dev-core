from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.mixins import PaginatedViewMixin
from projects.permissions import IsProjectAccessible
from projects.selectors import get_milestone_by_id, list_project_milestones
from projects.serializers.input import CreateMilestoneSerializer, UpdateMilestoneSerializer
from projects.serializers.output import MilestoneSerializer
from projects.services import create_milestone, delete_milestone, update_milestone


class MilestoneListCreateView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated, IsProjectAccessible]

    def get(self, request, project_id):
        milestones = list_project_milestones(request.project)
        return self.paginate(milestones, MilestoneSerializer, request)

    def post(self, request, project_id):
        serializer = CreateMilestoneSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        milestone = create_milestone(
            project=request.project, **serializer.validated_data,
        )
        output = MilestoneSerializer(milestone).data
        return Response(output, status=status.HTTP_201_CREATED)


class MilestoneDetailView(APIView):
    permission_classes = [IsAuthenticated, IsProjectAccessible]

    def _get_milestone(self, project, milestone_id):
        milestone = get_milestone_by_id(project, milestone_id)
        if milestone is None:
            raise NotFound("Milestone not found.")
        return milestone

    def get(self, request, project_id, milestone_id):
        milestone = self._get_milestone(request.project, milestone_id)
        output = MilestoneSerializer(milestone).data
        return Response(output, status=status.HTTP_200_OK)

    def put(self, request, project_id, milestone_id):
        milestone = self._get_milestone(request.project, milestone_id)
        serializer = UpdateMilestoneSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        milestone = update_milestone(milestone, **serializer.validated_data)
        output = MilestoneSerializer(milestone).data
        return Response(output, status=status.HTTP_200_OK)

    def delete(self, request, project_id, milestone_id):
        milestone = self._get_milestone(request.project, milestone_id)
        delete_milestone(milestone)
        return Response(status=status.HTTP_204_NO_CONTENT)
