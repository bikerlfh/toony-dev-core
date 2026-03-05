from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from organizations.permissions import IsOrganizationMember
from organizations.selectors import global_search
from organizations.serializers.output import GlobalSearchResultSerializer


class GlobalSearchView(APIView):
    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def get(self, request, org_id):
        query = request.query_params.get("q", "").strip()
        if not query:
            return Response(
                {"issues": [], "projects": [], "teams": [], "labels": []},
                status=status.HTTP_200_OK,
            )

        results = global_search(request.organization, query, limit=5)
        output = GlobalSearchResultSerializer(results).data
        return Response(output, status=status.HTTP_200_OK)
