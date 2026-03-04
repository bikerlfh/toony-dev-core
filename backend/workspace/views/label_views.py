from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.mixins import PaginatedViewMixin
from workspace.permissions import IsWorkspaceAdmin, IsWorkspaceMember
from workspace.selectors import get_label_by_id, list_labels
from workspace.serializers.input import CreateLabelSerializer, UpdateLabelSerializer
from workspace.serializers.output import LabelSerializer
from workspace.services import create_label, delete_label, update_label


class LabelListCreateView(PaginatedViewMixin, APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), IsWorkspaceAdmin()]
        return [IsAuthenticated(), IsWorkspaceMember()]

    def get(self, request):
        search = request.query_params.get("q")
        labels = list_labels(search=search)
        return self.paginate(labels, LabelSerializer, request)

    def post(self, request):
        serializer = CreateLabelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        label = create_label(**serializer.validated_data)
        output = LabelSerializer(label).data
        return Response(output, status=status.HTTP_201_CREATED)


class LabelDetailView(APIView):
    def get_permissions(self):
        if self.request.method == "GET":
            return [IsAuthenticated(), IsWorkspaceMember()]
        return [IsAuthenticated(), IsWorkspaceAdmin()]

    def _get_label(self, label_id):
        label = get_label_by_id(label_id)
        if label is None:
            raise NotFound("Label not found.")
        return label

    def get(self, request, label_id):
        label = self._get_label(label_id)
        output = LabelSerializer(label).data
        return Response(output, status=status.HTTP_200_OK)

    def put(self, request, label_id):
        label = self._get_label(label_id)
        serializer = UpdateLabelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        label = update_label(label, **serializer.validated_data)
        output = LabelSerializer(label).data
        return Response(output, status=status.HTTP_200_OK)

    def delete(self, request, label_id):
        label = self._get_label(label_id)
        delete_label(label)
        return Response(status=status.HTTP_204_NO_CONTENT)
