from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from organizations.permissions import IsOrganizationAdmin, IsOrganizationMember
from projects.selectors import get_label_by_id, list_organization_labels
from projects.serializers.input import CreateLabelSerializer, UpdateLabelSerializer
from projects.serializers.output import LabelSerializer
from projects.services import create_label, delete_label, update_label


class LabelListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), IsOrganizationAdmin()]
        return [IsAuthenticated(), IsOrganizationMember()]

    def get(self, request, org_slug):
        labels = list_organization_labels(request.organization)
        output = LabelSerializer(labels, many=True).data
        return Response(output, status=status.HTTP_200_OK)

    def post(self, request, org_slug):
        serializer = CreateLabelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        label = create_label(
            organization=request.organization,
            **serializer.validated_data,
        )
        output = LabelSerializer(label).data
        return Response(output, status=status.HTTP_201_CREATED)


class LabelDetailView(APIView):
    def get_permissions(self):
        if self.request.method in ("PUT", "DELETE"):
            return [IsAuthenticated(), IsOrganizationAdmin()]
        return [IsAuthenticated(), IsOrganizationMember()]

    def _get_label(self, organization, label_id):
        label = get_label_by_id(organization, label_id)
        if label is None:
            raise NotFound("Label not found.")
        return label

    def get(self, request, org_slug, label_id):
        label = self._get_label(request.organization, label_id)
        output = LabelSerializer(label).data
        return Response(output, status=status.HTTP_200_OK)

    def put(self, request, org_slug, label_id):
        label = self._get_label(request.organization, label_id)
        serializer = UpdateLabelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        label = update_label(label, **serializer.validated_data)
        output = LabelSerializer(label).data
        return Response(output, status=status.HTTP_200_OK)

    def delete(self, request, org_slug, label_id):
        label = self._get_label(request.organization, label_id)
        delete_label(label)
        return Response(status=status.HTTP_204_NO_CONTENT)
