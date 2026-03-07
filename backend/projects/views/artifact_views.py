from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.mixins import PaginatedViewMixin
from projects.permissions import IsProjectAccessible
from projects.selectors import (
    get_artifact_by_id,
    get_issue_by_id,
    list_all_artifacts,
    list_issue_artifacts,
)
from projects.serializers.input import (
    CreateArtifactSerializer,
    UpdateArtifactSerializer,
)
from projects.serializers.output import (
    IssueArtifactDetailSerializer,
    IssueArtifactListSerializer,
)
from projects.services import create_artifact, delete_artifact, update_artifact
from toony_agents.models import AgentTask


class IssueArtifactListCreateView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated, IsProjectAccessible]

    def _get_issue(self, project, issue_id):
        issue = get_issue_by_id(issue_id)
        if issue is None or issue.project_id != project.id:
            raise NotFound("Issue not found.")
        return issue

    def get(self, request, project_id, issue_id):
        issue = self._get_issue(request.project, issue_id)
        artifacts = list_issue_artifacts(issue)
        return self.paginate(artifacts, IssueArtifactListSerializer, request)

    def post(self, request, project_id, issue_id):
        issue = self._get_issue(request.project, issue_id)
        serializer = CreateArtifactSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            agent_task = AgentTask.objects.get(id=data["agent_task_id"])
        except AgentTask.DoesNotExist:
            raise NotFound("Agent task not found.")

        artifact = create_artifact(
            issue=issue,
            agent_task=agent_task,
            title=data["title"],
            artifact_type=data["artifact_type"],
            content=data["content"],
            session_id=data["session_id"],
            requires_approval=data.get("requires_approval", False),
        )
        output = IssueArtifactDetailSerializer(artifact).data
        return Response(output, status=status.HTTP_201_CREATED)


class IssueArtifactDetailView(APIView):
    permission_classes = [IsAuthenticated, IsProjectAccessible]

    def _get_artifact(self, project, issue_id, artifact_id):
        issue = get_issue_by_id(issue_id)
        if issue is None or issue.project_id != project.id:
            raise NotFound("Issue not found.")

        artifact = get_artifact_by_id(artifact_id)
        if artifact is None or artifact.issue_id != issue.id:
            raise NotFound("Artifact not found.")
        return artifact

    def get(self, request, project_id, issue_id, artifact_id):
        artifact = self._get_artifact(request.project, issue_id, artifact_id)
        output = IssueArtifactDetailSerializer(artifact).data
        return Response(output)

    def patch(self, request, project_id, issue_id, artifact_id):
        artifact = self._get_artifact(request.project, issue_id, artifact_id)
        serializer = UpdateArtifactSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        artifact = update_artifact(artifact, **serializer.validated_data)
        output = IssueArtifactDetailSerializer(artifact).data
        return Response(output)

    def delete(self, request, project_id, issue_id, artifact_id):
        artifact = self._get_artifact(request.project, issue_id, artifact_id)
        delete_artifact(artifact)
        return Response(status=status.HTTP_204_NO_CONTENT)


class GlobalArtifactListView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        filters = {}
        for key in ("artifact_type", "status", "issue_id", "agent_task_id"):
            val = request.query_params.get(key)
            if val:
                filters[key] = val

        artifacts = list_all_artifacts(request.user, filters=filters or None)
        return self.paginate(artifacts, IssueArtifactListSerializer, request)


class GlobalArtifactDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _check_access(self, artifact, user):
        from projects.models import ProjectMembership
        has_access = ProjectMembership.objects.filter(
            project=artifact.issue.project,
            user=user,
        ).exists()
        if not has_access:
            raise NotFound("Artifact not found.")

    def get(self, request, artifact_id):
        artifact = get_artifact_by_id(artifact_id)
        if artifact is None:
            raise NotFound("Artifact not found.")
        self._check_access(artifact, request.user)
        output = IssueArtifactDetailSerializer(artifact).data
        return Response(output)

    def patch(self, request, artifact_id):
        artifact = get_artifact_by_id(artifact_id)
        if artifact is None:
            raise NotFound("Artifact not found.")
        self._check_access(artifact, request.user)

        serializer = UpdateArtifactSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        artifact = update_artifact(artifact, **serializer.validated_data)
        output = IssueArtifactDetailSerializer(artifact).data
        return Response(output)

    def delete(self, request, artifact_id):
        artifact = get_artifact_by_id(artifact_id)
        if artifact is None:
            raise NotFound("Artifact not found.")
        self._check_access(artifact, request.user)
        delete_artifact(artifact)
        return Response(status=status.HTTP_204_NO_CONTENT)
