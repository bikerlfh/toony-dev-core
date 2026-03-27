from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from projects.permissions import IsProjectAccessible
from projects.selectors import get_project_file_tree
from projects.serializers.output import ProjectFileTreeSerializer


class ProjectFileTreeView(APIView):
    permission_classes = [IsAuthenticated, IsProjectAccessible]

    def get(self, request, project_id):
        file_tree = get_project_file_tree(request.project)
        if file_tree is None:
            return Response(
                {"tree": [], "branch": "", "synced_at": None},
                status=status.HTTP_200_OK,
            )
        output = ProjectFileTreeSerializer(file_tree).data
        return Response(output, status=status.HTTP_200_OK)
