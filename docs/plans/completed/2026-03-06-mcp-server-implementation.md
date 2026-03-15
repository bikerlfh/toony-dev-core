# MCP Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone Python MCP server that exposes Toony's backend to Claude Code/Desktop, plus a User API Key authentication system in the backend.

**Architecture:** Standalone Python MCP server (`mcp-server/`) communicates with the Django backend over HTTP using API key auth. Backend gets a new `UserAPIKey` model, DRF authentication class, and CRUD endpoints. The MCP server exposes 17 tools across issues, projects, and workspace domains.

**Tech Stack:** Python `mcp` SDK, `requests`, Django 5, DRF, pytest, factory_boy

---

### Task 1: UserAPIKey Model

**Files:**
- Create: `backend/accounts/models/api_key.py`
- Modify: `backend/accounts/models/__init__.py`

**Step 1: Create the model**

Create `backend/accounts/models/api_key.py`:

```python
from django.db import models

from common.models import BaseModel


class UserAPIKey(BaseModel):
    user = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="api_keys",
    )
    key_hash = models.CharField(max_length=128, unique=True)
    key_prefix = models.CharField(max_length=8)
    name = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "user_api_keys"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.key_prefix}...)"
```

**Step 2: Update `__init__.py`**

Modify `backend/accounts/models/__init__.py` to add:

```python
from accounts.models.api_key import UserAPIKey
```

And update `__all__` to include `"UserAPIKey"`.

**Step 3: Generate and run migration**

Run: `docker compose exec backend python manage.py makemigrations accounts`
Run: `docker compose exec backend python manage.py migrate`

**Step 4: Commit**

```bash
git add backend/accounts/models/
git commit -m "feat(accounts): add UserAPIKey model"
```

---

### Task 2: API Key Service and Selector

**Files:**
- Create: `backend/accounts/services/api_key_service.py`
- Create: `backend/accounts/selectors/api_key_selector.py`
- Modify: `backend/accounts/services/__init__.py`
- Modify: `backend/accounts/selectors/__init__.py`

**Step 1: Write tests for service and selector**

Create `backend/tests/test_api_keys.py`:

```python
import pytest
from rest_framework import status

from accounts.models import UserAPIKey
from accounts.services.api_key_service import generate_api_key, revoke_api_key
from accounts.selectors.api_key_selector import list_user_api_keys, get_api_key_by_id
from tests.factories import UserFactory


API_KEYS_URL = "/api/auth/api-keys/"


def api_key_detail_url(key_id):
    return f"{API_KEYS_URL}{key_id}/"


@pytest.mark.django_db
class TestAPIKeyService:
    def test_generate_api_key(self, user):
        key_obj, raw_key = generate_api_key(user=user, name="test-key")

        assert raw_key.startswith("toony_")
        assert len(raw_key) == 46  # "toony_" + 40 hex chars
        assert key_obj.key_prefix == raw_key[:8]
        assert key_obj.name == "test-key"
        assert key_obj.is_active is True
        assert key_obj.user == user

    def test_generate_api_key_stores_hash_not_raw(self, user):
        key_obj, raw_key = generate_api_key(user=user, name="test-key")

        assert key_obj.key_hash != raw_key
        assert len(key_obj.key_hash) == 64  # SHA-256 hex

    def test_revoke_api_key(self, user):
        key_obj, _ = generate_api_key(user=user, name="test-key")
        revoke_api_key(key_obj)

        key_obj.refresh_from_db()
        assert key_obj.is_active is False


@pytest.mark.django_db
class TestAPIKeySelector:
    def test_list_user_api_keys(self, user):
        generate_api_key(user=user, name="key-1")
        generate_api_key(user=user, name="key-2")
        other_user = UserFactory()
        generate_api_key(user=other_user, name="other-key")

        keys = list_user_api_keys(user)
        assert keys.count() == 2

    def test_get_api_key_by_id(self, user):
        key_obj, _ = generate_api_key(user=user, name="test-key")

        found = get_api_key_by_id(user, key_obj.id)
        assert found is not None
        assert found.id == key_obj.id

    def test_get_api_key_by_id_wrong_user(self, user):
        other_user = UserFactory()
        key_obj, _ = generate_api_key(user=other_user, name="test-key")

        found = get_api_key_by_id(user, key_obj.id)
        assert found is None
```

**Step 2: Run tests to verify they fail**

Run: `docker compose exec backend pytest tests/test_api_keys.py -v`
Expected: ImportError — modules don't exist yet.

**Step 3: Create the service**

Create `backend/accounts/services/api_key_service.py`:

```python
import hashlib
import secrets

from accounts.models import UserAPIKey


def generate_api_key(*, user, name):
    raw_key = f"toony_{secrets.token_hex(20)}"
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    key_prefix = raw_key[:8]

    key_obj = UserAPIKey.objects.create(
        user=user,
        key_hash=key_hash,
        key_prefix=key_prefix,
        name=name,
    )
    return key_obj, raw_key


def revoke_api_key(api_key):
    api_key.is_active = False
    api_key.save(update_fields=["is_active", "updated_at"])
```

**Step 4: Create the selector**

Create `backend/accounts/selectors/api_key_selector.py`:

```python
from accounts.models import UserAPIKey


def list_user_api_keys(user):
    return UserAPIKey.objects.filter(user=user).order_by("-created_at")


def get_api_key_by_id(user, key_id):
    return UserAPIKey.objects.filter(user=user, id=key_id).first()
```

**Step 5: Update `__init__.py` files**

Add to `backend/accounts/services/__init__.py`:
```python
from accounts.services.api_key_service import generate_api_key, revoke_api_key
```

Add to `backend/accounts/selectors/__init__.py`:
```python
from accounts.selectors.api_key_selector import list_user_api_keys, get_api_key_by_id
```

**Step 6: Run tests to verify they pass**

Run: `docker compose exec backend pytest tests/test_api_keys.py -v`
Expected: All 5 tests PASS.

**Step 7: Commit**

```bash
git add backend/accounts/services/ backend/accounts/selectors/ backend/tests/test_api_keys.py
git commit -m "feat(accounts): add API key service and selector with tests"
```

---

### Task 3: APIKeyAuthentication Class

**Files:**
- Create: `backend/accounts/authentication.py`
- Modify: `backend/config/settings/base.py`

**Step 1: Add authentication tests to `test_api_keys.py`**

Append to `backend/tests/test_api_keys.py`:

```python
@pytest.mark.django_db
class TestAPIKeyAuthentication:
    def test_authenticate_with_valid_key(self, api_client, user):
        _, raw_key = generate_api_key(user=user, name="test-key")

        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {raw_key}")
        response = api_client.get("/api/auth/me/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == str(user.id)

    def test_authenticate_with_invalid_key(self, api_client):
        api_client.credentials(HTTP_AUTHORIZATION="Bearer toony_invalidkey1234567890")
        response = api_client.get("/api/auth/me/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_authenticate_with_revoked_key(self, api_client, user):
        key_obj, raw_key = generate_api_key(user=user, name="test-key")
        revoke_api_key(key_obj)

        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {raw_key}")
        response = api_client.get("/api/auth/me/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_authenticate_updates_last_used_at(self, api_client, user):
        key_obj, raw_key = generate_api_key(user=user, name="test-key")
        assert key_obj.last_used_at is None

        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {raw_key}")
        api_client.get("/api/auth/me/")

        key_obj.refresh_from_db()
        assert key_obj.last_used_at is not None

    def test_jwt_still_works(self, authenticated_client):
        response = authenticated_client.get("/api/auth/me/")
        assert response.status_code == status.HTTP_200_OK
```

**Step 2: Run tests to verify new ones fail**

Run: `docker compose exec backend pytest tests/test_api_keys.py::TestAPIKeyAuthentication -v`
Expected: FAIL — API key auth not recognized, returns 401 for valid keys.

**Step 3: Create the authentication class**

Create `backend/accounts/authentication.py`:

```python
import hashlib

from django.utils import timezone
from rest_framework.authentication import BaseAuthentication

from accounts.models import UserAPIKey


class APIKeyAuthentication(BaseAuthentication):
    keyword = "Bearer"

    def authenticate(self, request):
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if not auth_header.startswith(f"{self.keyword} "):
            return None

        token = auth_header[len(self.keyword) + 1:]
        if not token.startswith("toony_"):
            return None

        key_hash = hashlib.sha256(token.encode()).hexdigest()
        try:
            api_key = UserAPIKey.objects.select_related("user").get(
                key_hash=key_hash, is_active=True,
            )
        except UserAPIKey.DoesNotExist:
            return None

        api_key.last_used_at = timezone.now()
        api_key.save(update_fields=["last_used_at"])

        return (api_key.user, api_key)
```

**Step 4: Register in DRF settings**

Modify `backend/config/settings/base.py`, update `DEFAULT_AUTHENTICATION_CLASSES`:

```python
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "accounts.authentication.APIKeyAuthentication",
    ),
    # ... rest stays the same
}
```

**Step 5: Run tests to verify they pass**

Run: `docker compose exec backend pytest tests/test_api_keys.py -v`
Expected: All 10 tests PASS.

Run: `docker compose exec backend pytest -v`
Expected: Full suite passes (API key auth is additive, doesn't break JWT).

**Step 6: Commit**

```bash
git add backend/accounts/authentication.py backend/config/settings/base.py backend/tests/test_api_keys.py
git commit -m "feat(accounts): add APIKeyAuthentication class for DRF"
```

---

### Task 4: API Key CRUD Endpoints

**Files:**
- Create: `backend/accounts/serializers/api_key_serializers.py`
- Create: `backend/accounts/views/api_key_views.py`
- Modify: `backend/accounts/views/__init__.py`
- Modify: `backend/accounts/urls.py`

**Step 1: Add endpoint tests to `test_api_keys.py`**

Append to `backend/tests/test_api_keys.py`:

```python
@pytest.mark.django_db
class TestAPIKeyEndpoints:
    def test_create_api_key(self, authenticated_client):
        response = authenticated_client.post(API_KEYS_URL, {"name": "my-key"})

        assert response.status_code == status.HTTP_201_CREATED
        assert "raw_key" in response.data
        assert response.data["raw_key"].startswith("toony_")
        assert response.data["name"] == "my-key"
        assert response.data["key_prefix"] == response.data["raw_key"][:8]

    def test_create_api_key_requires_name(self, authenticated_client):
        response = authenticated_client.post(API_KEYS_URL, {})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_list_api_keys(self, authenticated_client, user):
        generate_api_key(user=user, name="key-1")
        generate_api_key(user=user, name="key-2")

        response = authenticated_client.get(API_KEYS_URL)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 2
        # raw_key must NOT be in list response
        for key_data in response.data["results"]:
            assert "raw_key" not in key_data
            assert "key_hash" not in key_data

    def test_revoke_api_key_endpoint(self, authenticated_client, user):
        key_obj, _ = generate_api_key(user=user, name="to-revoke")

        response = authenticated_client.delete(api_key_detail_url(key_obj.id))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        key_obj.refresh_from_db()
        assert key_obj.is_active is False

    def test_revoke_other_users_key_returns_404(self, authenticated_client):
        other_user = UserFactory()
        key_obj, _ = generate_api_key(user=other_user, name="not-mine")

        response = authenticated_client.delete(api_key_detail_url(key_obj.id))
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_unauthenticated_cannot_create_key(self, api_client):
        response = api_client.post(API_KEYS_URL, {"name": "test"})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
```

**Step 2: Run tests to verify they fail**

Run: `docker compose exec backend pytest tests/test_api_keys.py::TestAPIKeyEndpoints -v`
Expected: FAIL — 404 (URLs don't exist yet).

**Step 3: Create serializers**

Create `backend/accounts/serializers/api_key_serializers.py`:

```python
from rest_framework import serializers

from accounts.models import UserAPIKey


class CreateAPIKeySerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)


class APIKeyOutputSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserAPIKey
        fields = [
            "id",
            "key_prefix",
            "name",
            "is_active",
            "last_used_at",
            "created_at",
        ]
        read_only_fields = fields


class APIKeyCreatedSerializer(APIKeyOutputSerializer):
    raw_key = serializers.CharField(read_only=True)

    class Meta(APIKeyOutputSerializer.Meta):
        fields = APIKeyOutputSerializer.Meta.fields + ["raw_key"]
        read_only_fields = fields
```

**Step 4: Create views**

Create `backend/accounts/views/api_key_views.py`:

```python
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.selectors.api_key_selector import get_api_key_by_id, list_user_api_keys
from accounts.serializers.api_key_serializers import (
    APIKeyCreatedSerializer,
    APIKeyOutputSerializer,
    CreateAPIKeySerializer,
)
from accounts.services.api_key_service import generate_api_key, revoke_api_key
from common.mixins import PaginatedViewMixin


class APIKeyListCreateView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        keys = list_user_api_keys(request.user)
        return self.paginate(keys, APIKeyOutputSerializer, request)

    def post(self, request):
        serializer = CreateAPIKeySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        key_obj, raw_key = generate_api_key(
            user=request.user,
            name=serializer.validated_data["name"],
        )

        output = APIKeyCreatedSerializer(key_obj).data
        output["raw_key"] = raw_key
        return Response(output, status=status.HTTP_201_CREATED)


class APIKeyDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, key_id):
        api_key = get_api_key_by_id(request.user, key_id)
        if api_key is None:
            return Response(status=status.HTTP_404_NOT_FOUND)

        revoke_api_key(api_key)
        return Response(status=status.HTTP_204_NO_CONTENT)
```

**Step 5: Update `__init__.py` and URLs**

Add to `backend/accounts/views/__init__.py`:
```python
from accounts.views.api_key_views import APIKeyDetailView, APIKeyListCreateView
```

And update `__all__` to include them.

Update `backend/accounts/urls.py`:

```python
from django.urls import path

from accounts.views import (
    APIKeyDetailView,
    APIKeyListCreateView,
    ChangePasswordView,
    LoginView,
    MeView,
    RefreshView,
)

app_name = "accounts"

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("refresh/", RefreshView.as_view(), name="refresh"),
    path("me/", MeView.as_view(), name="me"),
    path("me/change-password/", ChangePasswordView.as_view(), name="change-password"),
    path("api-keys/", APIKeyListCreateView.as_view(), name="api-key-list-create"),
    path("api-keys/<uuid:key_id>/", APIKeyDetailView.as_view(), name="api-key-detail"),
]
```

**Step 6: Run tests to verify they pass**

Run: `docker compose exec backend pytest tests/test_api_keys.py -v`
Expected: All 16 tests PASS.

Run: `docker compose exec backend pytest -v`
Expected: Full suite passes.

**Step 7: Commit**

```bash
git add backend/accounts/serializers/api_key_serializers.py backend/accounts/views/ backend/accounts/urls.py backend/tests/test_api_keys.py
git commit -m "feat(accounts): add API key CRUD endpoints"
```

---

### Task 5: MCP Server — Project Scaffolding

**Files:**
- Create: `mcp-server/pyproject.toml`
- Create: `mcp-server/.env.example`
- Create: `mcp-server/src/toony_mcp/__init__.py`
- Create: `mcp-server/src/toony_mcp/__main__.py`
- Create: `mcp-server/src/toony_mcp/server.py`
- Create: `mcp-server/src/toony_mcp/client.py`
- Create: `mcp-server/src/toony_mcp/tools/__init__.py`

**Step 1: Create `pyproject.toml`**

```toml
[project]
name = "toony-mcp"
version = "0.1.0"
description = "MCP server for Toony Dev Core"
requires-python = ">=3.11"
dependencies = [
    "mcp[cli]>=1.0.0",
    "requests>=2.31.0",
    "python-dotenv>=1.0.0",
]

[project.scripts]
toony-mcp = "toony_mcp.server:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

**Step 2: Create `.env.example`**

```
TOONY_API_URL=http://localhost:8000/api
TOONY_API_KEY=toony_your_key_here
```

**Step 3: Create `client.py`**

```python
import requests


class ToonyClient:
    def __init__(self, api_url: str, api_key: str):
        self.api_url = api_url.rstrip("/")
        self.session = requests.Session()
        self.session.headers["Authorization"] = f"Bearer {api_key}"
        self.session.headers["Content-Type"] = "application/json"

    def _request(self, method: str, path: str, **kwargs) -> dict | list:
        url = f"{self.api_url}{path}"
        response = self.session.request(method, url, **kwargs)

        if response.status_code == 204:
            return {"ok": True}

        if response.status_code >= 400:
            try:
                detail = response.json()
            except ValueError:
                detail = response.text
            return {"error": f"HTTP {response.status_code}", "detail": detail}

        return response.json()

    def _get(self, path: str, params: dict | None = None) -> dict | list:
        return self._request("GET", path, params=params)

    def _post(self, path: str, data: dict | None = None) -> dict:
        return self._request("POST", path, json=data)

    def _put(self, path: str, data: dict | None = None) -> dict:
        return self._request("PUT", path, json=data)

    def _patch(self, path: str, data: dict | None = None) -> dict:
        return self._request("PATCH", path, json=data)

    def _delete(self, path: str) -> dict:
        return self._request("DELETE", path)

    # ── Auth ──────────────────────────────────────────────
    def get_me(self) -> dict:
        return self._get("/auth/me/")

    # ── Projects ──────────────────────────────────────────
    def list_projects(self, search: str | None = None) -> dict:
        params = {}
        if search:
            params["search"] = search
        return self._get("/projects/", params=params)

    def get_project(self, project_id: str) -> dict:
        return self._get(f"/projects/{project_id}/")

    def list_project_members(self, project_id: str) -> dict:
        return self._get(f"/projects/{project_id}/members/")

    def list_project_milestones(self, project_id: str) -> dict:
        return self._get(f"/projects/{project_id}/milestones/")

    def list_project_cycles(self, project_id: str) -> dict:
        return self._get(f"/projects/{project_id}/cycles/")

    # ── Issues ────────────────────────────────────────────
    def list_project_issues(self, project_id: str, **filters) -> dict:
        params = {k: v for k, v in filters.items() if v is not None}
        return self._get(f"/projects/{project_id}/issues/", params=params)

    def get_issue(self, project_id: str, issue_id: str) -> dict:
        return self._get(f"/projects/{project_id}/issues/{issue_id}/")

    def create_issue(self, project_id: str, data: dict) -> dict:
        return self._post(f"/projects/{project_id}/issues/", data=data)

    def update_issue(self, project_id: str, issue_id: str, data: dict) -> dict:
        return self._patch(f"/projects/{project_id}/issues/{issue_id}/", data=data)

    # ── Comments ──────────────────────────────────────────
    def list_issue_comments(self, project_id: str, issue_id: str) -> dict:
        return self._get(f"/projects/{project_id}/issues/{issue_id}/comments/")

    def create_comment(self, project_id: str, issue_id: str, body: str) -> dict:
        return self._post(
            f"/projects/{project_id}/issues/{issue_id}/comments/",
            data={"body": body},
        )

    # ── Activities ────────────────────────────────────────
    def list_issue_activities(self, project_id: str, issue_id: str) -> dict:
        return self._get(f"/projects/{project_id}/issues/{issue_id}/activities/")

    # ── Artifacts ─────────────────────────────────────────
    def list_issue_artifacts(self, project_id: str, issue_id: str) -> dict:
        return self._get(f"/projects/{project_id}/issues/{issue_id}/artifacts/")

    def create_artifact(self, project_id: str, issue_id: str, data: dict) -> dict:
        return self._post(
            f"/projects/{project_id}/issues/{issue_id}/artifacts/",
            data=data,
        )

    # ── Workspace ─────────────────────────────────────────
    def list_labels(self, search: str | None = None) -> dict:
        params = {}
        if search:
            params["search"] = search
        return self._get("/workspace/labels/", params=params)

    def search_global(self, organization_id: str, query: str) -> dict:
        return self._get(f"/search/{organization_id}/", params={"q": query})
```

**Step 4: Create `server.py`**

```python
import os

from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

from toony_mcp.client import ToonyClient

load_dotenv()

mcp = FastMCP("Toony Dev Core")


def get_client() -> ToonyClient:
    api_url = os.environ.get("TOONY_API_URL", "http://localhost:8000/api")
    api_key = os.environ.get("TOONY_API_KEY", "")
    if not api_key:
        raise RuntimeError("TOONY_API_KEY environment variable is required")
    return ToonyClient(api_url, api_key)


# Import tool modules to register them
import toony_mcp.tools.issues  # noqa: F401, E402
import toony_mcp.tools.projects  # noqa: F401, E402
import toony_mcp.tools.workspace  # noqa: F401, E402


def main():
    mcp.run()


if __name__ == "__main__":
    main()
```

**Step 5: Create `__main__.py`**

```python
from toony_mcp.server import main

main()
```

**Step 6: Create empty `__init__.py` files**

Create `mcp-server/src/toony_mcp/__init__.py` and `mcp-server/src/toony_mcp/tools/__init__.py` as empty files.

**Step 7: Commit**

```bash
git add mcp-server/
git commit -m "feat(mcp): scaffold MCP server package with HTTP client"
```

---

### Task 6: MCP Tools — Issues

**Files:**
- Create: `mcp-server/src/toony_mcp/tools/issues.py`

**Step 1: Implement issue tools**

Create `mcp-server/src/toony_mcp/tools/issues.py`:

```python
import json

from toony_mcp.server import get_client, mcp


@mcp.tool()
def get_issue(issue_id: str) -> str:
    """Get detailed information about an issue by its UUID or identifier (e.g., 'ENG-42').

    Returns the issue's title, description, status, priority, assignee,
    reporter, labels, milestone, cycle, and other metadata.
    """
    client = get_client()
    me = client.get_me()
    if "error" in me:
        return json.dumps(me)

    # Try as identifier first (contains '-'), then as UUID
    if "-" in issue_id and not _looks_like_uuid(issue_id):
        # Search across user's projects for this identifier
        projects = client.list_projects()
        if "error" in projects:
            return json.dumps(projects)
        for project in projects.get("results", []):
            issues = client.list_project_issues(project["id"], search=issue_id)
            if "error" not in issues:
                for issue in issues.get("results", []):
                    if issue.get("identifier") == issue_id:
                        return json.dumps(issue)
        return json.dumps({"error": f"Issue '{issue_id}' not found"})
    else:
        # UUID — need project_id, search across projects
        projects = client.list_projects()
        if "error" in projects:
            return json.dumps(projects)
        for project in projects.get("results", []):
            result = client.get_issue(project["id"], issue_id)
            if "error" not in result:
                return json.dumps(result)
        return json.dumps({"error": f"Issue '{issue_id}' not found"})


@mcp.tool()
def list_project_issues(
    project_id: str,
    status: str | None = None,
    priority: str | None = None,
    assignee_id: str | None = None,
    milestone_id: str | None = None,
    cycle_id: str | None = None,
    label_ids: str | None = None,
    search: str | None = None,
) -> str:
    """List issues in a project with optional filters.

    Args:
        project_id: UUID of the project
        status: Filter by status (BACKLOG, TODO, IN_PROGRESS, IN_REVIEW, DONE, CANCELED)
        priority: Filter by priority (NONE, URGENT, HIGH, MEDIUM, LOW)
        assignee_id: Filter by assignee UUID
        milestone_id: Filter by milestone UUID
        cycle_id: Filter by cycle UUID
        label_ids: Comma-separated label UUIDs
        search: Full-text search query
    """
    client = get_client()
    result = client.list_project_issues(
        project_id,
        status=status,
        priority=priority,
        assignee_id=assignee_id,
        milestone_id=milestone_id,
        cycle_id=cycle_id,
        label_ids=label_ids,
        search=search,
    )
    return json.dumps(result)


@mcp.tool()
def get_my_issues(
    status: str | None = None,
    priority: str | None = None,
    search: str | None = None,
) -> str:
    """Get issues assigned to the authenticated user across all projects.

    Args:
        status: Filter by status (BACKLOG, TODO, IN_PROGRESS, IN_REVIEW, DONE, CANCELED)
        priority: Filter by priority (NONE, URGENT, HIGH, MEDIUM, LOW)
        search: Full-text search query
    """
    client = get_client()
    me = client.get_me()
    if "error" in me:
        return json.dumps(me)

    projects = client.list_projects()
    if "error" in projects:
        return json.dumps(projects)

    all_issues = []
    for project in projects.get("results", []):
        issues = client.list_project_issues(
            project["id"],
            status=status,
            priority=priority,
            assignee_id=me["id"],
            search=search,
        )
        if "error" not in issues:
            for issue in issues.get("results", []):
                issue["project_name"] = project["name"]
                all_issues.append(issue)

    return json.dumps({"count": len(all_issues), "results": all_issues})


@mcp.tool()
def create_issue(
    project_id: str,
    title: str,
    description: str = "",
    status: str | None = None,
    priority: str | None = None,
    assignee_id: str | None = None,
    milestone_id: str | None = None,
    cycle_id: str | None = None,
    label_ids: str | None = None,
    estimate: float | None = None,
    due_date: str | None = None,
) -> str:
    """Create a new issue in a project.

    Args:
        project_id: UUID of the project
        title: Issue title
        description: Issue description (markdown)
        status: Initial status (BACKLOG, TODO, IN_PROGRESS, IN_REVIEW, DONE, CANCELED)
        priority: Priority (NONE, URGENT, HIGH, MEDIUM, LOW)
        assignee_id: UUID of the user to assign
        milestone_id: UUID of the milestone
        cycle_id: UUID of the cycle
        label_ids: Comma-separated label UUIDs
        estimate: Story points or time estimate
        due_date: Due date (YYYY-MM-DD)
    """
    client = get_client()
    data = {"title": title, "description": description}

    if status:
        data["status"] = status
    if priority:
        data["priority"] = priority
    if assignee_id:
        data["assignee_id"] = assignee_id
    if milestone_id:
        data["milestone_id"] = milestone_id
    if cycle_id:
        data["cycle_id"] = cycle_id
    if label_ids:
        data["label_ids"] = [lid.strip() for lid in label_ids.split(",")]
    if estimate is not None:
        data["estimate"] = estimate
    if due_date:
        data["due_date"] = due_date

    result = client.create_issue(project_id, data)
    return json.dumps(result)


@mcp.tool()
def update_issue(
    issue_id: str,
    project_id: str,
    title: str | None = None,
    description: str | None = None,
    status: str | None = None,
    priority: str | None = None,
    assignee_id: str | None = None,
    milestone_id: str | None = None,
    cycle_id: str | None = None,
    label_ids: str | None = None,
    estimate: float | None = None,
    due_date: str | None = None,
) -> str:
    """Update an existing issue.

    Args:
        issue_id: UUID of the issue
        project_id: UUID of the project the issue belongs to
        title: New title
        description: New description (markdown)
        status: New status (BACKLOG, TODO, IN_PROGRESS, IN_REVIEW, DONE, CANCELED)
        priority: New priority (NONE, URGENT, HIGH, MEDIUM, LOW)
        assignee_id: UUID of new assignee (or "none" to unassign)
        milestone_id: UUID of milestone (or "none" to unset)
        cycle_id: UUID of cycle (or "none" to unset)
        label_ids: Comma-separated label UUIDs (replaces all labels)
        estimate: New estimate
        due_date: New due date (YYYY-MM-DD, or "none" to unset)
    """
    client = get_client()
    data = {}

    if title is not None:
        data["title"] = title
    if description is not None:
        data["description"] = description
    if status is not None:
        data["status"] = status
    if priority is not None:
        data["priority"] = priority
    if assignee_id is not None:
        data["assignee_id"] = None if assignee_id == "none" else assignee_id
    if milestone_id is not None:
        data["milestone_id"] = None if milestone_id == "none" else milestone_id
    if cycle_id is not None:
        data["cycle_id"] = None if cycle_id == "none" else cycle_id
    if label_ids is not None:
        data["label_ids"] = [lid.strip() for lid in label_ids.split(",") if lid.strip()]
    if estimate is not None:
        data["estimate"] = estimate
    if due_date is not None:
        data["due_date"] = None if due_date == "none" else due_date

    result = client.update_issue(project_id, issue_id, data)
    return json.dumps(result)


@mcp.tool()
def list_issue_comments(issue_id: str, project_id: str) -> str:
    """List all comments on an issue.

    Args:
        issue_id: UUID of the issue
        project_id: UUID of the project
    """
    client = get_client()
    result = client.list_issue_comments(project_id, issue_id)
    return json.dumps(result)


@mcp.tool()
def create_comment(issue_id: str, project_id: str, body: str) -> str:
    """Add a comment to an issue.

    Args:
        issue_id: UUID of the issue
        project_id: UUID of the project
        body: Comment text (markdown supported)
    """
    client = get_client()
    result = client.create_comment(project_id, issue_id, body)
    return json.dumps(result)


@mcp.tool()
def list_issue_activities(issue_id: str, project_id: str) -> str:
    """View the activity/change history of an issue.

    Args:
        issue_id: UUID of the issue
        project_id: UUID of the project
    """
    client = get_client()
    result = client.list_issue_activities(project_id, issue_id)
    return json.dumps(result)


@mcp.tool()
def list_issue_artifacts(issue_id: str, project_id: str) -> str:
    """List all artifacts attached to an issue.

    Args:
        issue_id: UUID of the issue
        project_id: UUID of the project
    """
    client = get_client()
    result = client.list_issue_artifacts(project_id, issue_id)
    return json.dumps(result)


@mcp.tool()
def create_artifact(
    issue_id: str,
    project_id: str,
    title: str,
    artifact_type: str,
    content: str,
    requires_approval: bool = False,
) -> str:
    """Publish an artifact (plan, design doc, spec, etc.) to an issue.

    Args:
        issue_id: UUID of the issue
        project_id: UUID of the project
        title: Artifact title
        artifact_type: Type (PLAN, DESIGN_DOC, TECHNICAL_SPEC, TEST_PLAN, OTHER)
        content: Artifact content (markdown)
        requires_approval: Whether the artifact needs approval before being finalized
    """
    client = get_client()
    data = {
        "title": title,
        "artifact_type": artifact_type,
        "content": content,
        "requires_approval": requires_approval,
    }
    result = client.create_artifact(project_id, issue_id, data)
    return json.dumps(result)


def _looks_like_uuid(s: str) -> bool:
    """Check if a string looks like a UUID (has dashes and is 36 chars)."""
    return len(s) == 36 and s.count("-") == 4
```

**Step 2: Commit**

```bash
git add mcp-server/src/toony_mcp/tools/issues.py
git commit -m "feat(mcp): add issue tools (10 tools)"
```

---

### Task 7: MCP Tools — Projects and Workspace

**Files:**
- Create: `mcp-server/src/toony_mcp/tools/projects.py`
- Create: `mcp-server/src/toony_mcp/tools/workspace.py`

**Step 1: Implement project tools**

Create `mcp-server/src/toony_mcp/tools/projects.py`:

```python
import json

from toony_mcp.server import get_client, mcp


@mcp.tool()
def list_projects(search: str | None = None) -> str:
    """List all projects accessible to the authenticated user.

    Args:
        search: Optional search query to filter projects by name or description
    """
    client = get_client()
    result = client.list_projects(search=search)
    return json.dumps(result)


@mcp.tool()
def get_project(project_id: str) -> str:
    """Get detailed information about a project.

    Args:
        project_id: UUID of the project
    """
    client = get_client()
    result = client.get_project(project_id)
    return json.dumps(result)


@mcp.tool()
def list_project_members(project_id: str) -> str:
    """List all members of a project with their roles.

    Args:
        project_id: UUID of the project
    """
    client = get_client()
    result = client.list_project_members(project_id)
    return json.dumps(result)


@mcp.tool()
def list_project_milestones(project_id: str) -> str:
    """List all milestones in a project.

    Args:
        project_id: UUID of the project
    """
    client = get_client()
    result = client.list_project_milestones(project_id)
    return json.dumps(result)


@mcp.tool()
def list_project_cycles(project_id: str) -> str:
    """List all cycles (sprints) in a project.

    Args:
        project_id: UUID of the project
    """
    client = get_client()
    result = client.list_project_cycles(project_id)
    return json.dumps(result)
```

**Step 2: Implement workspace tools**

Create `mcp-server/src/toony_mcp/tools/workspace.py`:

```python
import json

from toony_mcp.server import get_client, mcp


@mcp.tool()
def list_labels(search: str | None = None) -> str:
    """List all available labels for tagging issues.

    Args:
        search: Optional search query to filter labels by name
    """
    client = get_client()
    result = client.list_labels(search=search)
    return json.dumps(result)


@mcp.tool()
def search_global(organization_id: str, query: str) -> str:
    """Search across issues, projects, teams, and labels within an organization.

    Args:
        organization_id: UUID of the organization to search in
        query: Search query string
    """
    client = get_client()
    result = client.search_global(organization_id, query)
    return json.dumps(result)
```

**Step 3: Commit**

```bash
git add mcp-server/src/toony_mcp/tools/
git commit -m "feat(mcp): add project (5) and workspace (2) tools"
```

---

### Task 8: MCP Server — Verify it Runs

**Step 1: Install and test the MCP server starts**

```bash
cd mcp-server && uv run toony-mcp --help
```

Expected: Server starts or shows help without crashing. If it shows MCP server output on stdio, that's correct.

**Step 2: Test with `mcp dev` (optional interactive test)**

```bash
cd mcp-server && uv run mcp dev src/toony_mcp/server.py
```

This opens the MCP Inspector in a browser where you can see all 17 tools listed.

**Step 3: Create `.mcp.json` at the project root**

Create `mcp-server/.mcp.json.example`:

```json
{
  "mcpServers": {
    "toony": {
      "command": "uv",
      "args": ["--directory", "./mcp-server", "run", "toony-mcp"],
      "env": {
        "TOONY_API_URL": "http://localhost:8000/api",
        "TOONY_API_KEY": "toony_your_key_here"
      }
    }
  }
}
```

**Step 4: Commit**

```bash
git add mcp-server/
git commit -m "feat(mcp): verify server runs, add .mcp.json example"
```

---

### Task 9: Full Backend Test Suite Verification

**Step 1: Run full test suite**

Run: `docker compose exec backend pytest -v`
Expected: All existing tests + new API key tests pass.

**Step 2: Run linter**

Run: `docker compose exec backend flake8 --max-line-length=120 --exclude=migrations,__pycache__`
Expected: No new lint errors.

**Step 3: Commit any fixes if needed**

---

### Task 10: Update Factory and Fixtures for API Keys

**Files:**
- Modify: `backend/tests/factories.py`
- Modify: `backend/conftest.py`

**Step 1: Add UserAPIKeyFactory**

Add to `backend/tests/factories.py`:

```python
from accounts.models import UserAPIKey

class UserAPIKeyFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = UserAPIKey

    user = factory.SubFactory(UserFactory)
    key_hash = factory.Sequence(lambda n: f"hash_{n:064d}")
    key_prefix = factory.Sequence(lambda n: f"toony_{n}")
    name = factory.Sequence(lambda n: f"key-{n}")
```

Add the import to `conftest.py` if needed and add a fixture:

```python
@pytest.fixture()
def user_api_key(user):
    from accounts.services.api_key_service import generate_api_key
    key_obj, raw_key = generate_api_key(user=user, name="test-key")
    key_obj._raw_key = raw_key  # Attach for test use
    return key_obj
```

**Step 2: Commit**

```bash
git add backend/tests/factories.py backend/conftest.py
git commit -m "test: add UserAPIKey factory and fixture"
```
