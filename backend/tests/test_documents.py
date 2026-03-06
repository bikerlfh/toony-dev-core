import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status

from tests.factories import IssueDocumentFactory

pytestmark = pytest.mark.django_db


def documents_url(project_id, issue_id):
    return f"/api/projects/{project_id}/issues/{issue_id}/documents/"


def document_detail_url(project_id, issue_id, document_id):
    return f"/api/projects/{project_id}/issues/{issue_id}/documents/{document_id}/"


class TestIssueDocumentList:
    def test_list_documents(self, authenticated_client, project, issue):
        IssueDocumentFactory(issue=issue, uploaded_by=issue.reporter)
        IssueDocumentFactory(issue=issue, uploaded_by=issue.reporter)

        url = documents_url(project.id, issue.id)
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 2

    def test_list_empty(self, authenticated_client, project, issue):
        url = documents_url(project.id, issue.id)
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 0

    def test_list_unauthenticated(self, api_client, project, issue):
        url = documents_url(project.id, issue.id)
        response = api_client.get(url)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestIssueDocumentUpload:
    def test_upload_pdf(self, authenticated_client, project, issue):
        file = SimpleUploadedFile(
            name="report.pdf",
            content=b"%PDF-1.4 fake content",
            content_type="application/pdf",
        )
        url = documents_url(project.id, issue.id)
        response = authenticated_client.post(url, {"file": file}, format="multipart")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["original_filename"] == "report.pdf"
        assert response.data["content_type"] == "application/pdf"
        assert response.data["file_size"] > 0
        assert "id" in response.data
        assert response.data["uploaded_by"]["id"] == str(issue.reporter.id)

    def test_upload_image(self, authenticated_client, project, issue):
        file = SimpleUploadedFile(
            name="photo.png",
            content=b"\x89PNG fake image",
            content_type="image/png",
        )
        url = documents_url(project.id, issue.id)
        response = authenticated_client.post(url, {"file": file}, format="multipart")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["original_filename"] == "photo.png"
        assert response.data["content_type"] == "image/png"

    def test_upload_rejected_type(self, authenticated_client, project, issue):
        file = SimpleUploadedFile(
            name="script.exe",
            content=b"MZ fake exe",
            content_type="application/x-msdownload",
        )
        url = documents_url(project.id, issue.id)
        response = authenticated_client.post(url, {"file": file}, format="multipart")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_upload_too_large(self, authenticated_client, project, issue):
        from projects.serializers.input import MAX_FILE_SIZE

        file = SimpleUploadedFile(
            name="big.pdf",
            content=b"x" * (MAX_FILE_SIZE + 1),
            content_type="application/pdf",
        )
        url = documents_url(project.id, issue.id)
        response = authenticated_client.post(url, {"file": file}, format="multipart")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_upload_no_file(self, authenticated_client, project, issue):
        url = documents_url(project.id, issue.id)
        response = authenticated_client.post(url, {}, format="multipart")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_upload_unauthenticated(self, api_client, project, issue):
        file = SimpleUploadedFile(
            name="doc.pdf",
            content=b"%PDF",
            content_type="application/pdf",
        )
        url = documents_url(project.id, issue.id)
        response = api_client.post(url, {"file": file}, format="multipart")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestIssueDocumentDelete:
    def test_delete_document(self, authenticated_client, project, issue):
        doc = IssueDocumentFactory(issue=issue, uploaded_by=issue.reporter)

        url = document_detail_url(project.id, issue.id, doc.id)
        response = authenticated_client.delete(url)

        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_delete_not_found(self, authenticated_client, project, issue):
        import uuid

        url = document_detail_url(project.id, issue.id, uuid.uuid4())
        response = authenticated_client.delete(url)

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_delete_wrong_issue(self, authenticated_client, project, issue):
        from tests.factories import IssueFactory

        other_issue = IssueFactory(project=project, reporter=issue.reporter)
        doc = IssueDocumentFactory(issue=other_issue, uploaded_by=issue.reporter)

        url = document_detail_url(project.id, issue.id, doc.id)
        response = authenticated_client.delete(url)

        assert response.status_code == status.HTTP_404_NOT_FOUND
