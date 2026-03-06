# IssueDocument (File Attachments) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to attach files (images, PDFs, office docs) to issues via a new `IssueDocument` model with full-stack CRUD.

**Architecture:** New `IssueDocument` model following existing layered pattern (model → selector → service → serializer → view). Frontend gets a fixed "Attachments" section below the issue description with drag-and-drop upload and thumbnail previews.

**Tech Stack:** Django 5, DRF, FileField, Next.js 15, React 19, Axios FormData, Tailwind CSS v4.

---

### Task 1: Model — IssueDocument

**Files:**
- Create: `backend/projects/models/document.py`
- Modify: `backend/projects/models/__init__.py`

**Step 1: Create the model file**

Create `backend/projects/models/document.py`:

```python
from django.db import models
from common.models import BaseModel


class IssueDocument(BaseModel):
    issue = models.ForeignKey(
        "projects.Issue",
        on_delete=models.CASCADE,
        related_name="documents",
    )
    uploaded_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="+",
    )
    file = models.FileField(upload_to="issue_documents/%Y/%m/")
    original_filename = models.CharField(max_length=500)
    file_size = models.PositiveIntegerField()
    content_type = models.CharField(max_length=100)

    class Meta:
        db_table = "issue_documents"
        ordering = ["-created_at"]

    def __str__(self):
        return self.original_filename
```

**Step 2: Export from models __init__**

Add to `backend/projects/models/__init__.py` at line 3 (after artifact import):

```python
from projects.models.document import IssueDocument
```

Add `"IssueDocument"` to the `__all__` list (after `"ArtifactStatus"` on line 37).

**Step 3: Generate and apply migration**

Run:
```bash
docker compose exec backend python manage.py makemigrations projects
docker compose exec backend python manage.py migrate
```

Expected: Migration `0011_issuedocument.py` created and applied.

**Step 4: Commit**

```bash
git add backend/projects/models/document.py backend/projects/models/__init__.py backend/projects/migrations/
git commit -m "feat: add IssueDocument model"
```

---

### Task 2: Factory + conftest fixture

**Files:**
- Modify: `backend/tests/factories.py`
- Modify: `backend/conftest.py`

**Step 1: Add IssueDocumentFactory**

Add to `backend/tests/factories.py` at the end (after `IssueArtifactFactory`):

```python
from django.core.files.base import ContentFile
from projects.models import IssueDocument


class IssueDocumentFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = IssueDocument

    issue = factory.SubFactory(IssueFactory)
    uploaded_by = factory.SubFactory(UserFactory)
    original_filename = factory.Sequence(lambda n: f"document_{n}.pdf")
    file_size = 1024
    content_type = "application/pdf"
    file = factory.LazyAttribute(
        lambda obj: ContentFile(b"fake file content", name=obj.original_filename)
    )
```

Also add `IssueDocument` to the imports from `projects.models` at line 7.

**Step 2: Add fixture to conftest**

Add to `backend/conftest.py` — import `IssueDocumentFactory` at line 4, then add fixture at the end:

```python
@pytest.fixture()
def issue_document(issue, user):
    return IssueDocumentFactory(issue=issue, uploaded_by=user)
```

**Step 3: Commit**

```bash
git add backend/tests/factories.py backend/conftest.py
git commit -m "test: add IssueDocument factory and fixture"
```

---

### Task 3: Selector

**Files:**
- Create: `backend/projects/selectors/document_selector.py`
- Modify: `backend/projects/selectors/__init__.py`

**Step 1: Create selector**

Create `backend/projects/selectors/document_selector.py`:

```python
from projects.models import IssueDocument


def list_issue_documents(issue):
    return (
        IssueDocument.objects
        .filter(issue=issue)
        .select_related("uploaded_by")
        .order_by("-created_at")
    )


def get_document_by_id(document_id):
    return (
        IssueDocument.objects
        .select_related("uploaded_by")
        .filter(id=document_id)
        .first()
    )
```

**Step 2: Export from selectors __init__**

Add to `backend/projects/selectors/__init__.py` at line 1 (before artifact import):

```python
from projects.selectors.document_selector import (
    get_document_by_id,
    list_issue_documents as list_issue_documents_qs,
)
```

Note: rename to `list_issue_documents_qs` to avoid collision with the existing `list_issue_documents` name used for artifacts. Actually, let me check — the existing one is `list_issue_artifacts`. So we can use `list_issue_documents` directly:

```python
from projects.selectors.document_selector import (
    get_document_by_id,
    list_issue_documents,
)
```

Add both to `__all__` list.

**Step 3: Commit**

```bash
git add backend/projects/selectors/document_selector.py backend/projects/selectors/__init__.py
git commit -m "feat: add IssueDocument selectors"
```

---

### Task 4: Service

**Files:**
- Create: `backend/projects/services/document_service.py`
- Modify: `backend/projects/services/__init__.py`

**Step 1: Create service**

Create `backend/projects/services/document_service.py`:

```python
from django.db import transaction

from common.broadcast import broadcast
from projects.models import IssueDocument


def create_issue_document(*, issue, uploaded_by, file):
    with transaction.atomic():
        document = IssueDocument.objects.create(
            issue=issue,
            uploaded_by=uploaded_by,
            file=file,
            original_filename=file.name,
            file_size=file.size,
            content_type=file.content_type or "application/octet-stream",
        )

    broadcast(
        f"project_{issue.project_id}",
        "document_created",
        {"issue_id": str(issue.id), "document_id": str(document.id)},
    )

    return document


def delete_issue_document(document):
    project_id = document.issue.project_id
    issue_id = str(document.issue_id)
    document_id = str(document.id)

    document.file.delete(save=False)
    document.delete()

    broadcast(
        f"project_{project_id}",
        "document_deleted",
        {"issue_id": issue_id, "document_id": document_id},
    )
```

**Step 2: Export from services __init__**

Add to `backend/projects/services/__init__.py` at line 1:

```python
from projects.services.document_service import (
    create_issue_document,
    delete_issue_document,
)
```

Add both to `__all__` list.

**Step 3: Commit**

```bash
git add backend/projects/services/document_service.py backend/projects/services/__init__.py
git commit -m "feat: add IssueDocument service layer"
```

---

### Task 5: Serializers

**Files:**
- Modify: `backend/projects/serializers/input.py`
- Modify: `backend/projects/serializers/output.py`

**Step 1: Add input serializer**

Add to the end of `backend/projects/serializers/input.py`:

```python
# --- IssueDocument ---

ALLOWED_DOCUMENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "text/plain",
}

ALLOWED_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt",
}

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


class UploadIssueDocumentSerializer(serializers.Serializer):
    file = serializers.FileField()

    def validate_file(self, file):
        import os

        ext = os.path.splitext(file.name)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise serializers.ValidationError(
                f"File type '{ext}' is not allowed. "
                f"Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
            )

        content_type = file.content_type or ""
        if content_type not in ALLOWED_DOCUMENT_TYPES:
            raise serializers.ValidationError(
                f"Content type '{content_type}' is not allowed."
            )

        if file.size > MAX_FILE_SIZE:
            raise serializers.ValidationError(
                f"File size {file.size} bytes exceeds maximum of {MAX_FILE_SIZE} bytes (10 MB)."
            )

        return file
```

**Step 2: Add output serializer**

Add to the end of `backend/projects/serializers/output.py`:

```python
from projects.models import IssueDocument


# --- IssueDocument ---

class _DocumentUploaderSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "first_name", "last_name"]
        read_only_fields = fields


class IssueDocumentSerializer(serializers.ModelSerializer):
    uploaded_by = _DocumentUploaderSerializer(read_only=True)

    class Meta:
        model = IssueDocument
        fields = [
            "id",
            "original_filename",
            "file",
            "file_size",
            "content_type",
            "uploaded_by",
            "created_at",
        ]
        read_only_fields = fields
```

Note: Check that `User` is already imported at the top of `output.py`. If not, add `from accounts.models import User`.

**Step 3: Commit**

```bash
git add backend/projects/serializers/input.py backend/projects/serializers/output.py
git commit -m "feat: add IssueDocument serializers"
```

---

### Task 6: Views

**Files:**
- Create: `backend/projects/views/document_views.py`
- Modify: `backend/projects/views/__init__.py`

**Step 1: Create views**

Create `backend/projects/views/document_views.py`:

```python
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
```

**Step 2: Export from views __init__**

Add to `backend/projects/views/__init__.py` at line 1:

```python
from projects.views.document_views import (
    IssueDocumentDetailView,
    IssueDocumentListCreateView,
)
```

Add both to `__all__` list.

**Step 3: Commit**

```bash
git add backend/projects/views/document_views.py backend/projects/views/__init__.py
git commit -m "feat: add IssueDocument views"
```

---

### Task 7: URL routes

**Files:**
- Modify: `backend/projects/urls.py`

**Step 1: Register URL patterns**

Add imports at top of `backend/projects/urls.py` (in the existing import block from `projects.views`):

```python
from projects.views import IssueDocumentListCreateView, IssueDocumentDetailView
```

Add URL patterns after the artifact patterns (after line 54):

```python
    # Documents
    path("<uuid:project_id>/issues/<uuid:issue_id>/documents/", IssueDocumentListCreateView.as_view(), name="issue-document-list-create"),
    path("<uuid:project_id>/issues/<uuid:issue_id>/documents/<uuid:document_id>/", IssueDocumentDetailView.as_view(), name="issue-document-detail"),
```

**Step 2: Commit**

```bash
git add backend/projects/urls.py
git commit -m "feat: register IssueDocument URL routes"
```

---

### Task 8: Backend tests

**Files:**
- Create: `backend/tests/test_documents.py`

**Step 1: Write tests**

Create `backend/tests/test_documents.py`:

```python
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

    def test_upload_too_large(self, authenticated_client, project, issue, settings):
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
```

**Step 2: Run tests**

Run:
```bash
docker compose exec backend pytest tests/test_documents.py -v
```

Expected: All tests PASS.

**Step 3: Commit**

```bash
git add backend/tests/test_documents.py
git commit -m "test: add IssueDocument API tests"
```

---

### Task 9: Frontend types + API module

**Files:**
- Create: `frontend/types/issue-documents.ts`
- Modify: `frontend/types/index.ts`
- Create: `frontend/lib/api/issue-documents.ts`

**Step 1: Create TypeScript types**

Create `frontend/types/issue-documents.ts`:

```typescript
export interface IssueDocument {
  id: string;
  original_filename: string;
  file: string;
  file_size: number;
  content_type: string;
  uploaded_by: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  created_at: string;
}
```

**Step 2: Export from types/index.ts**

Add to `frontend/types/index.ts` after the artifacts export block (after line 160):

```typescript
export type { IssueDocument } from "./issue-documents";
```

**Step 3: Create API module**

Create `frontend/lib/api/issue-documents.ts`:

```typescript
import api from "@/lib/api";
import type { IssueDocument } from "@/types/issue-documents";
import type { PaginatedResponse } from "@/types";

const base = (projectId: string, issueId: string) =>
  `/projects/${projectId}/issues/${issueId}/documents`;

export async function listIssueDocuments(
  projectId: string,
  issueId: string
): Promise<PaginatedResponse<IssueDocument>> {
  const { data } = await api.get<PaginatedResponse<IssueDocument>>(
    `${base(projectId, issueId)}/`
  );
  return data;
}

export async function uploadIssueDocument(
  projectId: string,
  issueId: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<IssueDocument> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<IssueDocument>(
    `${base(projectId, issueId)}/`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      },
    }
  );
  return data;
}

export async function deleteIssueDocument(
  projectId: string,
  issueId: string,
  documentId: string
): Promise<void> {
  await api.delete(`${base(projectId, issueId)}/${documentId}/`);
}
```

**Step 4: Commit**

```bash
git add frontend/types/issue-documents.ts frontend/types/index.ts frontend/lib/api/issue-documents.ts
git commit -m "feat: add IssueDocument frontend types and API module"
```

---

### Task 10: Frontend — AttachmentsSection component

**Files:**
- Modify: `frontend/app/(dashboard)/projects/[id]/issues/[issueId]/page.tsx`

**Step 1: Add imports**

Add to the imports at the top of the issue detail page (around line 14):

```typescript
import {
  listIssueDocuments,
  uploadIssueDocument,
  deleteIssueDocument,
} from "@/lib/api/issue-documents";
import type { IssueDocument } from "@/types/issue-documents";
```

**Step 2: Add AttachmentsSection component**

Add the following component before the existing `ArtifactsSection` (before line 577):

```typescript
// --- Attachments Section ---

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

const FILE_TYPE_ICONS: Record<string, string> = {
  "application/pdf": "PDF",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.ms-excel": "XLS",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "text/csv": "CSV",
  "text/plain": "TXT",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentsSection({
  projectId,
  issueId,
}: {
  projectId: string;
  issueId: string;
}) {
  const [documents, setDocuments] = useState<IssueDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploading, setUploading] = useState<Map<string, number>>(new Map());
  const [isDragging, setIsDragging] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IssueDocument | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await listIssueDocuments(projectId, issueId);
      setDocuments(res.results);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, issueId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  async function handleFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      const tempId = `${file.name}-${Date.now()}`;
      setUploading((prev) => new Map(prev).set(tempId, 0));
      try {
        await uploadIssueDocument(projectId, issueId, file, (percent) => {
          setUploading((prev) => new Map(prev).set(tempId, percent));
        });
        await fetchDocuments();
      } catch {
        // upload failed — silently remove progress
      } finally {
        setUploading((prev) => {
          const next = new Map(prev);
          next.delete(tempId);
          return next;
        });
      }
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteIssueDocument(projectId, issueId, deleteTarget.id);
      setDeleteTarget(null);
      fetchDocuments();
    } finally {
      setIsDeleting(false);
    }
  }

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
  // file URLs from DRF are relative (/media/...), resolve to backend host
  const backendOrigin = apiBase.replace(/\/api\/?$/, "");

  return (
    <div className="mt-6">
      <h3 className="mb-3 text-xs font-medium uppercase text-slate-500">Attachments</h3>

      {/* Drop zone */}
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed p-4 text-sm transition-colors ${
          isDragging
            ? "border-indigo-500 bg-indigo-500/10 text-indigo-400"
            : "border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-400"
        }`}
      >
        <span>Drop files here or click to upload</span>
        <input
          type="file"
          multiple
          className="hidden"
          accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFiles(e.target.files);
              e.target.value = "";
            }
          }}
        />
      </label>

      {/* Upload progress */}
      {uploading.size > 0 && (
        <div className="mt-3 space-y-2">
          {Array.from(uploading.entries()).map(([id, percent]) => (
            <div key={id} className="flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="text-xs text-slate-500">{percent}%</span>
            </div>
          ))}
        </div>
      )}

      {/* File list */}
      {isLoading ? (
        <p className="mt-3 text-sm text-slate-500">Loading attachments...</p>
      ) : documents.length > 0 ? (
        <div className="mt-3 space-y-2">
          {documents.map((doc) => {
            const isImage = IMAGE_TYPES.has(doc.content_type);
            const fileUrl = doc.file.startsWith("http") ? doc.file : `${backendOrigin}${doc.file}`;
            const typeLabel = FILE_TYPE_ICONS[doc.content_type] || doc.content_type.split("/")[1]?.toUpperCase() || "FILE";

            return (
              <div
                key={doc.id}
                className="flex items-center gap-3 rounded-xl border border-slate-800/60 bg-slate-900 p-3"
              >
                {/* Thumbnail or icon */}
                {isImage ? (
                  <img
                    src={fileUrl}
                    alt={doc.original_filename}
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-[10px] font-bold text-slate-400">
                    {typeLabel}
                  </div>
                )}

                {/* File info */}
                <div className="min-w-0 flex-1">
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-sm text-slate-200 hover:text-white"
                  >
                    {doc.original_filename}
                  </a>
                  <p className="text-xs text-slate-500">
                    {formatFileSize(doc.file_size)}
                    {doc.uploaded_by && (
                      <> · {doc.uploaded_by.first_name} {doc.uploaded_by.last_name}</>
                    )}
                  </p>
                </div>

                {/* Delete */}
                <button
                  onClick={() => setDeleteTarget(doc)}
                  className="shrink-0 text-xs text-red-400 transition-colors hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {deleteTarget && (
        <ConfirmModal
          title="Remove attachment"
          message={`Remove "${deleteTarget.original_filename}"? This cannot be undone.`}
          confirmLabel="Remove"
          confirmVariant="danger"
          isLoading={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
```

**Step 3: Insert AttachmentsSection into the issue detail layout**

In the main page component, add the `<AttachmentsSection>` between the description block and the tabs block. Find this section (around line 368-370):

```tsx
          </div>

          {/* Tabs */}
```

Insert between them:

```tsx
          {/* Attachments — always visible */}
          <AttachmentsSection projectId={projectId} issueId={issueId} />

          {/* Tabs */}
```

The `</div>` at line 368 closes the description section. The `AttachmentsSection` goes right after it, before the `{/* Tabs */}` comment at line 370.

**Step 4: Commit**

```bash
git add frontend/app/\(dashboard\)/projects/\[id\]/issues/\[issueId\]/page.tsx
git commit -m "feat: add Attachments section to issue detail page"
```

---

### Task 11: Verify full stack

**Step 1: Run backend tests**

```bash
docker compose exec backend pytest tests/test_documents.py -v
```

Expected: All tests PASS.

**Step 2: Run all backend tests**

```bash
docker compose exec backend pytest -v
```

Expected: No regressions.

**Step 3: Run frontend lint**

```bash
docker compose exec frontend ./node_modules/.bin/next lint
```

Expected: No errors.

**Step 4: Run frontend build**

```bash
docker compose exec frontend ./node_modules/.bin/next build
```

Expected: Build succeeds.

**Step 5: Manual smoke test**

1. Start `make up`
2. Open an issue in the browser
3. Verify "Attachments" section appears below description
4. Upload a PNG image → verify thumbnail shows
5. Upload a PDF → verify type icon shows
6. Click filename → verify download works
7. Click "Remove" → verify confirm modal → confirm → file removed
8. Try uploading a .exe → verify rejection toast/error

**Step 6: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address integration issues from smoke test"
```
