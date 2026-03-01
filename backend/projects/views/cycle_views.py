from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from projects.permissions import IsProjectAccessible
from projects.selectors import get_cycle_by_id, list_project_cycles
from projects.serializers.input import CreateCycleSerializer, UpdateCycleSerializer
from projects.serializers.output import CycleSerializer
from projects.services import create_cycle, delete_cycle, update_cycle


class CycleListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsProjectAccessible]

    def get(self, request, org_slug, project_slug):
        cycles = list_project_cycles(request.project)
        output = CycleSerializer(cycles, many=True).data
        return Response(output, status=status.HTTP_200_OK)

    def post(self, request, org_slug, project_slug):
        serializer = CreateCycleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        cycle = create_cycle(
            project=request.project, **serializer.validated_data,
        )
        output = CycleSerializer(cycle).data
        return Response(output, status=status.HTTP_201_CREATED)


class CycleDetailView(APIView):
    permission_classes = [IsAuthenticated, IsProjectAccessible]

    def _get_cycle(self, project, cycle_id):
        cycle = get_cycle_by_id(project, cycle_id)
        if cycle is None:
            raise NotFound("Cycle not found.")
        return cycle

    def get(self, request, org_slug, project_slug, cycle_id):
        cycle = self._get_cycle(request.project, cycle_id)
        output = CycleSerializer(cycle).data
        return Response(output, status=status.HTTP_200_OK)

    def put(self, request, org_slug, project_slug, cycle_id):
        cycle = self._get_cycle(request.project, cycle_id)
        serializer = UpdateCycleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        cycle = update_cycle(cycle, **serializer.validated_data)
        output = CycleSerializer(cycle).data
        return Response(output, status=status.HTTP_200_OK)

    def delete(self, request, org_slug, project_slug, cycle_id):
        cycle = self._get_cycle(request.project, cycle_id)
        delete_cycle(cycle)
        return Response(status=status.HTTP_204_NO_CONTENT)
