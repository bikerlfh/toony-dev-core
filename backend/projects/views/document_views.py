from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.mixins import PaginatedViewMixin
from projects.permissions import IsProjectAccessible
from projects.selectors import get_document_by_id, get_issue_by_id, list_issue_documents
from projects.serializers.input import UploadIssueDocumentSerializer
from projects.serializers.output import IssueDocumentSerializer
from projects.services import create_issue_document, delete_issue_document


class IssueDocumentListCreateView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated, IsProjectAccessible]
    parser_classes = [MultiPartParser]

    def _get_issue(self, project, issue_id):
        issue = get_issue_by_id(issue_id)
        if issue is None or issue.project_id != project.id:
            raise NotFound("Issue not found.")
        return issue

    def get(self, request, project_id, issue_id):
        issue = self._get_issue(request.project, issue_id)
        documents = list_issue_documents(issue)
        return self.paginate(documents, IssueDocumentSerializer, request)

    def post(self, request, project_id, issue_id):
        issue = self._get_issue(request.project, issue_id)
        serializer = UploadIssueDocumentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        document = create_issue_document(
            issue=issue,
            uploaded_by=request.user,
            file=serializer.validated_data["file"],
        )
        output = IssueDocumentSerializer(document).data
        return Response(output, status=status.HTTP_201_CREATED)


class IssueDocumentDetailView(APIView):
    permission_classes = [IsAuthenticated, IsProjectAccessible]

    def _get_document(self, project, issue_id, document_id):
        issue = get_issue_by_id(issue_id)
        if issue is None or issue.project_id != project.id:
            raise NotFound("Issue not found.")

        document = get_document_by_id(document_id)
        if document is None or document.issue_id != issue.id:
            raise NotFound("Document not found.")
        return document

    def delete(self, request, project_id, issue_id, document_id):
        document = self._get_document(request.project, issue_id, document_id)
        delete_issue_document(document)
        return Response(status=status.HTTP_204_NO_CONTENT)
