# Issue Full Detail Endpoint — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create `GET /api/issues/{issue_id}/` that returns complete issue context (detail + comments + activities + artifacts + documents) in one call, and simplify the MCP `get_issue` tool to use it.

**Architecture:** New selector fetches issue with all relations via `Prefetch`. New serializer extends `IssueDetailSerializer` fields with nested collections. New view does auth + project membership check. MCP client/tool simplified to single API call.

**Tech Stack:** Django 5 / DRF, FastMCP (Python), pytest + factory_boy

---

### Task 1: Selector — `get_issue_full_detail`

**Files:**
- Modify: `backend/projects/selectors/issue_selector.py` (append new function after line 101)
- Modify: `backend/projects/selectors/__init__.py` (add export)

**Step 1: Write the failing test**

Create file `backend/tests/test_issue_full_detail.py`:

```python
import pytest
from rest_framework import status

from tests.factories import (
    IssueArtifactFactory,
    IssueCommentFactory,
    IssueDocumentFactory,
    IssueFactory,
)

pytestmark = pytest.mark.django_db

FAKE_UUID = "00000000-0000-0000-0000-000000000000"


def full_detail_url(issue_id):
    return f"/api/issues/{issue_id}/"


class TestIssueFullDetailSelector:
    def test_get_by_uuid(self, authenticated_client, organization, project, issue):
        url = full_detail_url(issue.id)
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == str(issue.id)

    def test_get_by_identifier(self, authenticated_client, organization, project, issue):
        url = full_detail_url(issue.identifier)
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["identifier"] == issue.identifier
```

**Step 2: Run test to verify it fails**

Run: `docker compose exec backend pytest tests/test_issue_full_detail.py::TestIssueFullDetailSelector -v`
Expected: FAIL (404 — URL does not exist yet)

**Step 3: Write the selector**

Append to `backend/projects/selectors/issue_selector.py` after `list_user_issues`:

```python
from django.db.models import Prefetch
from projects.models import IssueArtifact, IssueComment, IssueDocument


def get_issue_full_detail(issue_id_or_identifier):
    """Fetch a single issue with all related data prefetched.

    Accepts a UUID string or an identifier like 'ENG-42'.
    Returns an Issue instance or raises Issue.DoesNotExist.
    """
    try:
        import uuid
        uuid.UUID(issue_id_or_identifier)
        lookup = {"id": issue_id_or_identifier}
    except ValueError:
        lookup = {"identifier__iexact": issue_id_or_identifier}

    return Issue.objects.select_related(
        "project", "assignee", "reporter", "milestone", "cycle", "parent",
    ).prefetch_related(
        "labels",
        Prefetch(
            "comments",
            queryset=IssueComment.objects.select_related("author").order_by("created_at"),
        ),
        Prefetch(
            "activities",
            queryset=IssueActivity.objects.select_related("user").order_by("-created_at"),
        ),
        Prefetch(
            "artifacts",
            queryset=IssueArtifact.objects.select_related("agent_task").order_by("-created_at"),
        ),
        Prefetch(
            "documents",
            queryset=IssueDocument.objects.select_related("uploaded_by").order_by("-created_at"),
        ),
    ).get(**lookup)
```

Note: The imports for `Prefetch`, `IssueArtifact`, `IssueComment`, `IssueDocument` should be added at the top of the file. `IssueActivity` is already imported.

**Step 4: Export the selector**

Add to `backend/projects/selectors/__init__.py`:

In the import block from `issue_selector` (line 15-23), add `get_issue_full_detail`:

```python
from projects.selectors.issue_selector import (
    get_issue_by_id,
    get_issue_by_identifier,
    get_issue_full_detail,      # ← add
    get_next_identifier,
    list_issue_activities,
    list_issue_comments,
    list_project_issues,
    list_user_issues,
)
```

Add `"get_issue_full_detail"` to the `__all__` list.

**Step 5: Commit**

```bash
git add backend/projects/selectors/issue_selector.py backend/projects/selectors/__init__.py
git commit -m "feat(selector): add get_issue_full_detail with prefetched relations"
```

---

### Task 2: Serializer — `IssueFullDetailSerializer`

**Files:**
- Modify: `backend/projects/serializers/output.py` (append after `IssueDetailSerializer`, line ~272)

**Step 1: Write the serializer**

Append after `IssueDetailSerializer` (around line 272, before the `# --- Comment ---` section):

```python
class IssueFullDetailSerializer(serializers.ModelSerializer):
    project = _IssueProjectSerializer(read_only=True)
    assignee = UserDetailSerializer(read_only=True)
    reporter = UserDetailSerializer(read_only=True)
    labels = LabelSerializer(many=True, read_only=True)
    milestone = MilestoneSerializer(read_only=True)
    cycle = CycleSerializer(read_only=True)
    parent_identifier = serializers.CharField(
        source="parent.identifier", read_only=True, default=None,
    )
    sub_issue_count = serializers.SerializerMethodField()
    comments = IssueCommentSerializer(many=True, read_only=True)
    activities = IssueActivitySerializer(many=True, read_only=True)
    artifacts = IssueArtifactListSerializer(many=True, read_only=True)
    documents = IssueDocumentSerializer(many=True, read_only=True)

    class Meta:
        model = Issue
        fields = [
            "id",
            "project",
            "identifier",
            "title",
            "description",
            "status",
            "priority",
            "assignee",
            "reporter",
            "labels",
            "milestone",
            "cycle",
            "parent_identifier",
            "sub_issue_count",
            "estimate",
            "due_date",
            "sort_order",
            "external_tracker_name",
            "external_tracker_url",
            "external_tracker_id",
            "comments",
            "activities",
            "artifacts",
            "documents",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_sub_issue_count(self, obj):
        return obj.sub_issues.count()
```

**Important:** The nested serializers (`IssueCommentSerializer`, `IssueActivitySerializer`, etc.) are defined AFTER `IssueDetailSerializer` in the file. Since `IssueFullDetailSerializer` references them, it must be placed AFTER all of these serializer definitions — i.e., at the **end of the file** (after `IssueDocumentSerializer`, line ~403).

**Step 2: Run test to verify serializer works**

Run: `docker compose exec backend pytest tests/test_issue_full_detail.py::TestIssueFullDetailSelector -v`
Expected: Still FAIL (view/URL not wired yet)

**Step 3: Commit**

```bash
git add backend/projects/serializers/output.py
git commit -m "feat(serializer): add IssueFullDetailSerializer with nested collections"
```

---

### Task 3: View & URL — `IssueFullDetailView`

**Files:**
- Modify: `backend/projects/views/issue_views.py` (append new view class)
- Modify: `backend/projects/views/__init__.py` (add export)
- Modify: `backend/config/urls.py` (add URL pattern)

**Step 1: Write the view**

Append at the end of `backend/projects/views/issue_views.py`:

```python
from projects.selectors import get_issue_full_detail
from projects.serializers.output import IssueFullDetailSerializer
from projects.models import ProjectMembership


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
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You are not a member of this project.")

        serializer = IssueFullDetailSerializer(issue)
        return Response(serializer.data, status=status.HTTP_200_OK)
```

Note: `Issue` model is needed for the except clause. Add `from projects.models import Issue` at the top if not already imported. `PermissionDenied` import should be at the top too.

**Step 2: Export the view**

Add to `backend/projects/views/__init__.py`:

In the import block from `issue_views` (lines 13-20), add `IssueFullDetailView`:

```python
from projects.views.issue_views import (
    IssueActivityListView,
    IssueCommentDetailView,
    IssueCommentListCreateView,
    IssueDetailView,
    IssueFullDetailView,      # ← add
    IssueListCreateView,
    UserIssueListView,
)
```

Add `"IssueFullDetailView"` to the `__all__` list.

**Step 3: Wire the URL**

In `backend/config/urls.py`, add the import and URL pattern.

Update the import on line 7:
```python
from projects.views import GlobalArtifactDetailView, GlobalArtifactListView, IssueFullDetailView, UserIssueListView
```

Add this URL pattern after the existing `api/issues/` line (line 15), before `api/artifacts/`:
```python
path("api/issues/<str:issue_id>/", IssueFullDetailView.as_view(), name="issue-full-detail"),
```

The final relevant block should look like:
```python
path("api/issues/", UserIssueListView.as_view(), name="user-issue-list"),
path("api/issues/<str:issue_id>/", IssueFullDetailView.as_view(), name="issue-full-detail"),
path("api/artifacts/", GlobalArtifactListView.as_view(), name="artifact-list"),
```

**Step 4: Run tests to verify they pass**

Run: `docker compose exec backend pytest tests/test_issue_full_detail.py::TestIssueFullDetailSelector -v`
Expected: PASS (both UUID and identifier lookup should work)

**Step 5: Commit**

```bash
git add backend/projects/views/issue_views.py backend/projects/views/__init__.py backend/config/urls.py
git commit -m "feat(api): add GET /api/issues/{issue_id}/ full detail endpoint"
```

---

### Task 4: Full Test Suite

**Files:**
- Modify: `backend/tests/test_issue_full_detail.py` (add remaining tests)

**Step 1: Add all remaining tests**

Replace the full content of `backend/tests/test_issue_full_detail.py`:

```python
import pytest
from rest_framework import status

from tests.factories import (
    IssueArtifactFactory,
    IssueCommentFactory,
    IssueDocumentFactory,
    IssueFactory,
    ProjectFactory,
    ProjectMembershipFactory,
    ProjectSettingsFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db

FAKE_UUID = "00000000-0000-0000-0000-000000000000"


def full_detail_url(issue_id):
    return f"/api/issues/{issue_id}/"


class TestIssueFullDetail:
    def test_get_by_uuid(self, authenticated_client, organization, project, issue):
        url = full_detail_url(issue.id)
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == str(issue.id)
        assert response.data["identifier"] == issue.identifier
        assert "project" in response.data
        assert response.data["project"]["id"] == str(project.id)

    def test_get_by_identifier(self, authenticated_client, organization, project, issue):
        url = full_detail_url(issue.identifier)
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["identifier"] == issue.identifier

    def test_includes_comments(
        self, authenticated_client, organization, project, issue, user
    ):
        IssueCommentFactory(issue=issue, author=user, body="First comment")
        IssueCommentFactory(issue=issue, author=user, body="Second comment")
        url = full_detail_url(issue.id)
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["comments"]) == 2
        assert response.data["comments"][0]["body"] == "First comment"

    def test_includes_activities(
        self, authenticated_client, organization, project, issue
    ):
        url = full_detail_url(issue.id)
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert "activities" in response.data
        assert isinstance(response.data["activities"], list)

    def test_includes_artifacts(
        self, authenticated_client, organization, project, issue, artifact
    ):
        url = full_detail_url(issue.id)
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["artifacts"]) == 1
        assert response.data["artifacts"][0]["title"] == artifact.title

    def test_includes_documents(
        self, authenticated_client, organization, project, issue, issue_document
    ):
        url = full_detail_url(issue.id)
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["documents"]) == 1
        assert response.data["documents"][0]["original_filename"] == issue_document.original_filename

    def test_empty_collections(
        self, authenticated_client, organization, project, issue
    ):
        url = full_detail_url(issue.id)
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["comments"] == []
        assert response.data["activities"] == []
        assert response.data["artifacts"] == []
        assert response.data["documents"] == []

    def test_not_found_uuid(self, authenticated_client, organization, project):
        url = full_detail_url(FAKE_UUID)
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_not_found_identifier(self, authenticated_client, organization, project):
        url = full_detail_url("NONEXIST-999")
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_unauthenticated(self, api_client, organization, project, issue):
        url = full_detail_url(issue.id)
        response = api_client.get(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_non_member_forbidden(self, organization, project, issue):
        from rest_framework.test import APIClient

        other_user = UserFactory()
        client = APIClient()
        client.force_authenticate(user=other_user)
        url = full_detail_url(issue.id)
        response = client.get(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN
```

Note: The `test_includes_activities` test checks the key exists and is a list. Activities may or may not be empty depending on whether the `issue` fixture triggers activity creation (it depends on how `IssueFactory` works — if it goes through the service layer it creates a "created" activity, if it uses the model directly it doesn't). The factory uses `DjangoModelFactory` so no activity is created — the list will be empty, which is fine.

**Step 2: Run all tests**

Run: `docker compose exec backend pytest tests/test_issue_full_detail.py -v`
Expected: All PASS

**Step 3: Run full test suite to check for regressions**

Run: `docker compose exec backend pytest -v`
Expected: All PASS

**Step 4: Commit**

```bash
git add backend/tests/test_issue_full_detail.py
git commit -m "test: add full test suite for issue full detail endpoint"
```

---

### Task 5: MCP Server — Client & Tool Update

**Files:**
- Modify: `mcp-server/src/toony_mcp/client.py` (add new method)
- Modify: `mcp-server/src/toony_mcp/tools/issues.py` (simplify `get_issue`)

**Step 1: Add client method**

In `mcp-server/src/toony_mcp/client.py`, add after the existing `get_issue` method (line 68):

```python
def get_issue_full_detail(self, issue_id: str) -> dict:
    return self._get(f"/issues/{issue_id}/")
```

**Step 2: Simplify the `get_issue` tool**

Replace the `get_issue` function in `mcp-server/src/toony_mcp/tools/issues.py` (lines 6-37) with:

```python
@mcp.tool()
def get_issue(issue_id: str) -> str:
    """Get detailed information about an issue by its UUID or identifier (e.g., 'ENG-42').

    Returns the issue with all related data: comments, activities,
    artifacts, documents, project info, assignee, reporter, labels,
    milestone, and cycle.
    """
    client = get_client()
    result = client.get_issue_full_detail(issue_id)
    return json.dumps(result)
```

The `_looks_like_uuid` helper at the bottom of the file (lines 311-312) is no longer needed by `get_issue`. Check if any other function uses it — if not, remove it.

**Step 3: Remove `_looks_like_uuid` if unused**

Search the file for `_looks_like_uuid`. If only `get_issue` used it, delete lines 311-312:

```python
def _looks_like_uuid(s: str) -> bool:
    return len(s) == 36 and s.count("-") == 4
```

**Step 4: Commit**

```bash
git add mcp-server/src/toony_mcp/client.py mcp-server/src/toony_mcp/tools/issues.py
git commit -m "feat(mcp): simplify get_issue to use new full detail endpoint"
```

---

### Task 6: Verify end-to-end

**Step 1: Run backend tests**

Run: `docker compose exec backend pytest -v`
Expected: All PASS

**Step 2: Verify the endpoint manually (optional)**

If the dev server is running:
```bash
# Get a JWT token
curl -s -X POST http://localhost:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@toony.dev","password":"admin123"}' | python -m json.tool

# Use the access token to test (replace <token> and <issue_identifier>)
curl -s http://localhost:8000/api/issues/<issue_identifier>/ \
  -H "Authorization: Bearer <token>" | python -m json.tool
```

**Step 3: Final commit (if any fixups needed)**

Only if fixes were required during verification.
