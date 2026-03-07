from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from common.mixins import PaginatedViewMixin
from projects.models import Cycle, Issue, Milestone, ProjectMembership
from projects.permissions import IsProjectAccessible
from projects.selectors import (
    get_issue_by_id,
    get_issue_by_identifier,
    get_issue_full_detail,
    list_issue_activities,
    list_issue_comments,
    list_project_issues,
    list_user_issues,
)
from projects.serializers.input import (
    CreateCommentSerializer,
    CreateIssueSerializer,
    UpdateCommentSerializer,
    UpdateIssueSerializer,
)
from projects.serializers.output import (
    CrossProjectIssueListSerializer,
    IssueActivitySerializer,
    IssueCommentSerializer,
    IssueDetailSerializer,
    IssueFullDetailSerializer,
    IssueListSerializer,
)
from projects.services import (
    create_comment,
    create_issue,
    delete_comment,
    delete_issue,
    update_comment,
    update_issue,
)


class IssueListCreateView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated, IsProjectAccessible]

    def get(self, request, project_id):
        search = request.query_params.get("q")
        filters = {}
        for key in ("status", "priority", "assignee_id", "milestone_id", "cycle_id"):
            val = request.query_params.get(key)
            if val:
                filters[key] = val

        label_ids = request.query_params.getlist("label_ids")
        if label_ids:
            filters["label_ids"] = label_ids

        parent_id = request.query_params.get("parent_id")
        if parent_id:
            filters["parent_id"] = parent_id

        issues = list_project_issues(request.project, filters=filters or None, search=search)
        return self.paginate(issues, IssueListSerializer, request)

    def post(self, request, project_id):
        serializer = CreateIssueSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        kwargs = {}

        # Resolve optional FKs
        assignee_id = data.pop("assignee_id", None)
        if assignee_id:
            try:
                kwargs["assignee"] = User.objects.get(id=assignee_id)
            except User.DoesNotExist:
                raise NotFound("Assignee not found.")

        milestone_id = data.pop("milestone_id", None)
        if milestone_id:
            try:
                kwargs["milestone"] = Milestone.objects.get(
                    id=milestone_id, project=request.project,
                )
            except Milestone.DoesNotExist:
                raise NotFound("Milestone not found.")

        cycle_id = data.pop("cycle_id", None)
        if cycle_id:
            try:
                kwargs["cycle"] = Cycle.objects.get(
                    id=cycle_id, project=request.project,
                )
            except Cycle.DoesNotExist:
                raise NotFound("Cycle not found.")

        parent_identifier = data.pop("parent_identifier", None)
        if parent_identifier:
            parent = get_issue_by_identifier(parent_identifier)
            if parent is None or parent.project_id != request.project.id:
                raise NotFound("Parent issue not found.")
            kwargs["parent"] = parent

        # Pass through remaining fields
        for field in ("status", "priority", "estimate", "due_date", "sort_order", "description"):
            if field in data:
                kwargs[field] = data[field]

        issue = create_issue(
            project=request.project,
            reporter=request.user,
            title=data["title"],
            label_ids=data.get("label_ids", []),
            **kwargs,
        )
        output = IssueDetailSerializer(issue).data
        return Response(output, status=status.HTTP_201_CREATED)


class IssueDetailView(APIView):
    permission_classes = [IsAuthenticated, IsProjectAccessible]

    def _get_issue(self, project, issue_id):
        issue = get_issue_by_id(issue_id)
        if issue is None or issue.project_id != project.id:
            raise NotFound("Issue not found.")
        return issue

    def get(self, request, project_id, issue_id):
        issue = self._get_issue(request.project, issue_id)
        output = IssueDetailSerializer(issue).data
        return Response(output, status=status.HTTP_200_OK)

    def put(self, request, project_id, issue_id):
        issue = self._get_issue(request.project, issue_id)
        serializer = UpdateIssueSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        kwargs = {}

        # Resolve optional FKs
        if "assignee_id" in data:
            assignee_id = data.pop("assignee_id")
            if assignee_id:
                try:
                    kwargs["assignee"] = User.objects.get(id=assignee_id)
                except User.DoesNotExist:
                    raise NotFound("Assignee not found.")
            else:
                kwargs["assignee"] = None

        if "milestone_id" in data:
            milestone_id = data.pop("milestone_id")
            if milestone_id:
                try:
                    kwargs["milestone"] = Milestone.objects.get(
                        id=milestone_id, project=request.project,
                    )
                except Milestone.DoesNotExist:
                    raise NotFound("Milestone not found.")
            else:
                kwargs["milestone"] = None

        if "cycle_id" in data:
            cycle_id = data.pop("cycle_id")
            if cycle_id:
                try:
                    kwargs["cycle"] = Cycle.objects.get(
                        id=cycle_id, project=request.project,
                    )
                except Cycle.DoesNotExist:
                    raise NotFound("Cycle not found.")
            else:
                kwargs["cycle"] = None

        if "parent_identifier" in data:
            parent_identifier = data.pop("parent_identifier")
            if parent_identifier:
                parent = get_issue_by_identifier(parent_identifier)
                if parent is None or parent.project_id != request.project.id:
                    raise NotFound("Parent issue not found.")
                kwargs["parent"] = parent
            else:
                kwargs["parent"] = None

        # Pass through remaining fields
        allowed = {
            "title", "description", "status", "priority",
            "estimate", "due_date", "sort_order",
            "external_tracker_name", "external_tracker_url",
            "external_tracker_id",
        }
        for field in allowed:
            if field in data:
                kwargs[field] = data[field]

        if "label_ids" in data:
            kwargs["label_ids"] = data["label_ids"]

        issue = update_issue(issue, request.user, **kwargs)
        output = IssueDetailSerializer(issue).data
        return Response(output, status=status.HTTP_200_OK)

    def delete(self, request, project_id, issue_id):
        issue = self._get_issue(request.project, issue_id)
        delete_issue(issue)
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssueCommentListCreateView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated, IsProjectAccessible]

    def _get_issue(self, project, issue_id):
        issue = get_issue_by_id(issue_id)
        if issue is None or issue.project_id != project.id:
            raise NotFound("Issue not found.")
        return issue

    def get(self, request, project_id, issue_id):
        issue = self._get_issue(request.project, issue_id)
        comments = list_issue_comments(issue)
        return self.paginate(comments, IssueCommentSerializer, request)

    def post(self, request, project_id, issue_id):
        issue = self._get_issue(request.project, issue_id)
        serializer = CreateCommentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        comment = create_comment(
            issue=issue,
            author=request.user,
            body=serializer.validated_data["body"],
        )
        output = IssueCommentSerializer(comment).data
        return Response(output, status=status.HTTP_201_CREATED)


class IssueCommentDetailView(APIView):
    permission_classes = [IsAuthenticated, IsProjectAccessible]

    def _get_comment(self, project, issue_id, comment_id):
        issue = get_issue_by_id(issue_id)
        if issue is None or issue.project_id != project.id:
            raise NotFound("Issue not found.")

        from projects.models import IssueComment
        try:
            return IssueComment.objects.select_related("author").get(
                id=comment_id, issue=issue,
            )
        except IssueComment.DoesNotExist:
            raise NotFound("Comment not found.")

    def put(self, request, project_id, issue_id, comment_id):
        comment = self._get_comment(request.project, issue_id, comment_id)
        serializer = UpdateCommentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        comment = update_comment(comment, body=serializer.validated_data["body"])
        output = IssueCommentSerializer(comment).data
        return Response(output, status=status.HTTP_200_OK)

    def delete(self, request, project_id, issue_id, comment_id):
        comment = self._get_comment(request.project, issue_id, comment_id)
        delete_comment(comment)
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssueActivityListView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated, IsProjectAccessible]

    def get(self, request, project_id, issue_id):
        issue = get_issue_by_id(issue_id)
        if issue is None or issue.project_id != request.project.id:
            raise NotFound("Issue not found.")

        activities = list_issue_activities(issue)
        return self.paginate(activities, IssueActivitySerializer, request)


class UserIssueListView(PaginatedViewMixin, APIView):
    """List issues across all projects the authenticated user belongs to."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        search = request.query_params.get("q")
        filters = {}
        for key in ("status", "priority", "assignee_id", "project_id"):
            val = request.query_params.get(key)
            if val:
                filters[key] = val

        issues = list_user_issues(request.user, filters=filters or None, search=search)
        return self.paginate(issues, CrossProjectIssueListSerializer, request)


class IssueFullDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, issue_id):
        try:
            issue = get_issue_full_detail(str(issue_id))
        except Issue.DoesNotExist:
            raise NotFound("Issue not found.")

        if not ProjectMembership.objects.filter(
            project=issue.project, user=request.user,
        ).exists():
            raise PermissionDenied("You are not a member of this project.")

        serializer = IssueFullDetailSerializer(issue, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)
