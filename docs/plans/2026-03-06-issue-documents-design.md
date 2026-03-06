# Issue Documents (File Attachments)

## Goal

Allow users to attach files (images, PDFs, office documents, text files) to issues via a new `IssueDocument` model. Files are displayed in a fixed section below the issue description with thumbnail previews for images.

## Model: `IssueDocument`

Extends `BaseModel` (UUID pk, created_at, updated_at). Table name: `issue_documents`.

| Field | Type | Details |
|-------|------|---------|
| `issue` | ForeignKey(Issue, CASCADE) | Parent issue |
| `uploaded_by` | ForeignKey(User, SET_NULL, null) | Uploader |
| `file` | FileField(upload_to="issue_documents/%Y/%m/") | Stored file |
| `original_filename` | CharField(max=500) | Original name from upload |
| `file_size` | PositiveIntegerField | Size in bytes |
| `content_type` | CharField(max=100) | MIME type |

Ordering: `-created_at`.

## Validation

- **Allowed types**: image/jpeg, image/png, image/gif, image/webp, application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, text/csv, text/plain
- **Allowed extensions**: .jpg, .jpeg, .png, .gif, .webp, .pdf, .doc, .docx, .xls, .xlsx, .csv, .txt
- **Max file size**: 10MB
- Validation happens in the input serializer before saving

## API Endpoints

All under `/api/projects/{project_id}/issues/{issue_id}/documents/`.

| Method | Path | Action |
|--------|------|--------|
| GET | `.../documents/` | List documents for issue |
| POST | `.../documents/` | Upload one file (multipart/form-data) |
| DELETE | `.../documents/{document_id}/` | Delete document (removes file from storage) |

No PUT/PATCH — documents are immutable. Re-upload to replace.

## Backend Architecture

Follows existing layered pattern:

- **Model**: `projects/models/document.py` → `IssueDocument`
- **Selector**: `projects/selectors/document_selectors.py` → `get_issue_documents(issue)`
- **Service**: `projects/services/document_services.py` → `create_issue_document(issue, user, file)`, `delete_issue_document(document)` (deletes file from storage too)
- **Input serializer**: `UploadIssueDocumentSerializer` — validates file field (type, size, extension)
- **Output serializer**: `IssueDocumentSerializer` — read-only, includes file URL, original_filename, file_size, content_type, uploaded_by (nested), created_at
- **Views**: `IssueDocumentListCreateView` (GET/POST), `IssueDocumentDetailView` (DELETE only)
- **Permissions**: Reuses `IsProjectMember` from existing issue views
- **URLs**: Register in `projects/urls.py`

## Frontend

### UI Placement

Fixed section below the issue description, above the tabs (Comments/Activity/Artifacts). Always visible.

### Components

- **AttachmentsSection**: Main container. Shows file list + upload area.
- **Drop zone**: Dashed border area with "Drop files here or click to upload". Accepts multiple files. Hidden when no permissions to upload.
- **File list**: Grid or list of uploaded documents.
  - Images: 48px thumbnail + filename + size + delete button
  - Other files: Type-specific icon (PDF, DOC, XLS, etc.) + filename + size + delete button
  - Click filename → downloads the file
- **Upload progress**: Per-file progress bar using Axios `onUploadProgress`

### API Module

`frontend/lib/api/issue-documents.ts`:
- `listIssueDocuments(projectId, issueId)`
- `uploadIssueDocument(projectId, issueId, file)` — sends as FormData
- `deleteIssueDocument(projectId, issueId, documentId)`

### Types

`IssueDocument` interface in `frontend/types/issue-document.ts`.

## Storage

- Uses Django's default `FileSystemStorage` (MEDIA_ROOT)
- Files stored at `media/issue_documents/YYYY/MM/<uuid-filename>`
- Standard `FileField` with `upload_to` — trivially switchable to S3 via django-storages later
- On delete: file removed from storage via `document.file.delete(save=False)` before model delete

## Out of Scope

- No inline PDF/document preview
- No drag-and-drop reordering
- No file versioning
- No comments on documents
- No S3/cloud storage (prepared for it, not implemented)
