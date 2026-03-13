# Runner Repository Cloning on Config Sync — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auto-clone project repositories when the runner connects and receives `config.sync`, reporting per-project results back to the backend via a new `AgentSystemEvent` model.

**Architecture:** New `AgentSystemEvent` model (append-only) in the `toony_agents` app. New `repo.clone.result` WebSocket message type from runner to backend. Runner's `process_config_sync()` skips folder creation for projects with `repository_url`; a new `clone_pending_repos()` function handles cloning and reporting. Backend REST endpoint exposes event history.

**Tech Stack:** Django 5, DRF, Django Channels (WebSocket), Python asyncio (runner), git CLI subprocess.

---

### Task 1: AgentSystemEvent model

**Files:**
- Create: `backend/apps/toony_agents/models/agent_system_event.py`
- Modify: `backend/apps/toony_agents/models/__init__.py`

**Step 1: Create the model file**

Create `backend/apps/toony_agents/models/agent_system_event.py`:

```python
import uuid

from django.db import models


class AgentSystemEventType(models.TextChoices):
    REPO_CLONE_SUCCESS = "REPO_CLONE_SUCCESS", "Repo Clone Success"
    REPO_CLONE_ERROR = "REPO_CLONE_ERROR", "Repo Clone Error"
    CONFIG_SYNC_COMPLETED = "CONFIG_SYNC_COMPLETED", "Config Sync Completed"
    CONFIG_SYNC_FAILED = "CONFIG_SYNC_FAILED", "Config Sync Failed"


class AgentSystemEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    toony_agent = models.ForeignKey(
        "toony_agents.ToonyAgent",
        on_delete=models.CASCADE,
        related_name="system_events",
    )
    event_type = models.CharField(
        max_length=50,
        choices=AgentSystemEventType.choices,
    )
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    data = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "agent_system_events"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["toony_agent", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.event_type} ({self.created_at})"
```

**Step 2: Export from models `__init__.py`**

Add to `backend/apps/toony_agents/models/__init__.py`:

```python
from .agent_system_event import AgentSystemEvent, AgentSystemEventType
```

And add `"AgentSystemEvent"` and `"AgentSystemEventType"` to the `__all__` list.

**Step 3: Generate and run migration**

Run: `make makemigrations` then `make migrate`

**Step 4: Commit**

```
feat(toony_agents): add AgentSystemEvent model
```

---

### Task 2: Backend selector, serializer, and service for system events

**Files:**
- Create: `backend/apps/toony_agents/selectors/agent_system_event_selector.py`
- Modify: `backend/apps/toony_agents/selectors/__init__.py`
- Modify: `backend/apps/toony_agents/serializers/output.py`
- Modify: `backend/apps/toony_agents/services/__init__.py`

**Step 1: Create selector**

Create `backend/apps/toony_agents/selectors/agent_system_event_selector.py`:

```python
from toony_agents.models import AgentSystemEvent


def list_system_events_for_agent(toony_agent, *, event_type=None, project_id=None):
    qs = AgentSystemEvent.objects.filter(toony_agent=toony_agent)
    if event_type:
        qs = qs.filter(event_type=event_type)
    if project_id:
        qs = qs.filter(project_id=project_id)
    return qs.select_related("organization", "project")
```

**Step 2: Export from selectors `__init__.py`**

Add to `backend/apps/toony_agents/selectors/__init__.py`:

```python
from .agent_system_event_selector import *  # noqa
```

**Step 3: Add output serializer**

Add to `backend/apps/toony_agents/serializers/output.py`, after the existing imports, add `AgentSystemEvent` to the import from `toony_agents.models`. Then add:

```python
class AgentSystemEventSerializer(serializers.ModelSerializer):
    organization = serializers.SerializerMethodField()
    project = serializers.SerializerMethodField()

    class Meta:
        model = AgentSystemEvent
        fields = ["id", "event_type", "organization", "project", "data", "created_at"]
        read_only_fields = fields

    def get_organization(self, obj):
        if not obj.organization:
            return None
        return {"id": str(obj.organization.id), "name": obj.organization.name}

    def get_project(self, obj):
        if not obj.project:
            return None
        return {"id": str(obj.project.id), "name": obj.project.name}
```

**Step 4: Commit**

```
feat(toony_agents): add system event selector and serializer
```

---

### Task 3: Backend REST endpoint for system events

**Files:**
- Modify: `backend/apps/toony_agents/views/agent_task_views.py` (add new view)
- Modify: `backend/apps/toony_agents/urls.py`

**Step 1: Write the failing test**

Add to `backend/tests/test_toony_agents.py`:

```python
class TestAgentSystemEventAPI:
    def test_list_system_events(self, authenticated_client, toony_agent):
        from toony_agents.models import AgentSystemEvent, AgentSystemEventType

        AgentSystemEvent.objects.create(
            toony_agent=toony_agent,
            event_type=AgentSystemEventType.REPO_CLONE_SUCCESS,
            data={"repository_url": "https://github.com/org/repo.git"},
        )

        response = authenticated_client.get(
            f"/api/toony-agents/{toony_agent.id}/system-events/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["event_type"] == "REPO_CLONE_SUCCESS"

    def test_list_system_events_filter_by_event_type(self, authenticated_client, toony_agent):
        from toony_agents.models import AgentSystemEvent, AgentSystemEventType

        AgentSystemEvent.objects.create(
            toony_agent=toony_agent,
            event_type=AgentSystemEventType.REPO_CLONE_SUCCESS,
            data={},
        )
        AgentSystemEvent.objects.create(
            toony_agent=toony_agent,
            event_type=AgentSystemEventType.REPO_CLONE_ERROR,
            data={},
        )

        response = authenticated_client.get(
            f"/api/toony-agents/{toony_agent.id}/system-events/?event_type=REPO_CLONE_ERROR"
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["event_type"] == "REPO_CLONE_ERROR"

    def test_list_system_events_filter_by_project(self, authenticated_client, toony_agent, project):
        from toony_agents.models import AgentSystemEvent, AgentSystemEventType

        AgentSystemEvent.objects.create(
            toony_agent=toony_agent,
            event_type=AgentSystemEventType.REPO_CLONE_SUCCESS,
            project=project,
            data={},
        )
        other_project = ProjectFactory(organization=project.organization)
        AgentSystemEvent.objects.create(
            toony_agent=toony_agent,
            event_type=AgentSystemEventType.REPO_CLONE_SUCCESS,
            project=other_project,
            data={},
        )

        response = authenticated_client.get(
            f"/api/toony-agents/{toony_agent.id}/system-events/?project_id={project.id}"
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
```

**Step 2: Run test to verify it fails**

Run: `docker compose exec backend pytest tests/test_toony_agents.py::TestAgentSystemEventAPI -v`
Expected: FAIL (404 — URL not registered yet)

**Step 3: Add the view**

Add to `backend/apps/toony_agents/views/agent_task_views.py`:

At the top, add imports:
```python
from toony_agents.selectors import list_system_events_for_agent
from toony_agents.serializers.output import AgentSystemEventSerializer
```

Then add the view class:

```python
class AgentSystemEventListView(PaginatedViewMixin, APIView):
    permission_classes = [IsAuthenticated, IsToonyAgentOrgMember]

    def get(self, request, agent_id):
        agent = request.toony_agent
        event_type = request.query_params.get("event_type")
        project_id = request.query_params.get("project_id")
        events = list_system_events_for_agent(
            agent, event_type=event_type, project_id=project_id,
        )
        return self.paginate(events, AgentSystemEventSerializer, request)
```

**Step 4: Add URL route**

Add to `backend/apps/toony_agents/urls.py`:

Import `AgentSystemEventListView` from `toony_agents.views.agent_task_views`.

Add to `urlpatterns`:

```python
path(
    "toony-agents/<uuid:agent_id>/system-events/",
    AgentSystemEventListView.as_view(),
    name="agent-system-event-list",
),
```

**Step 5: Run tests to verify they pass**

Run: `docker compose exec backend pytest tests/test_toony_agents.py::TestAgentSystemEventAPI -v`
Expected: PASS

**Step 6: Commit**

```
feat(toony_agents): add system events REST endpoint
```

---

### Task 4: Backend WebSocket consumer handler for `repo.clone.result`

**Files:**
- Modify: `backend/apps/toony_agents/consumers.py`

**Step 1: Add async DB helper**

Add after the existing `_create_task_event` helper (around line 87):

```python
@database_sync_to_async
def _create_system_event(agent_id, event_type, organization_id, project_id, data):
    from toony_agents.models import AgentSystemEvent
    return AgentSystemEvent.objects.create(
        toony_agent_id=agent_id,
        event_type=event_type,
        organization_id=organization_id,
        project_id=project_id,
        data=data,
    )
```

**Step 2: Add handler in `ToonyAgentRunnerConsumer.receive_json`**

In `consumers.py`, inside `receive_json`, before the `else` branch (line 478), add:

```python
elif msg_type == "repo.clone.result":
    clone_status = content.get("status")
    project_id = content.get("project_id")
    organization_id = content.get("organization_id")
    repository_url = content.get("repository_url", "")

    from toony_agents.models import AgentSystemEventType
    event_type = (
        AgentSystemEventType.REPO_CLONE_SUCCESS
        if clone_status == "success"
        else AgentSystemEventType.REPO_CLONE_ERROR
    )
    event_data = {"repository_url": repository_url}
    if clone_status == "success":
        event_data["branch"] = content.get("branch", "")
        event_data["clone_duration_ms"] = content.get("clone_duration_ms", 0)
    else:
        event_data["error"] = content.get("error", "")

    await _create_system_event(
        self.agent_id, event_type, organization_id, project_id, event_data,
    )
    await self.channel_layer.group_send(
        self.frontend_group,
        {"type": "repo_clone_result", "data": content},
    )
```

**Step 3: Add group handler in `ToonyAgentConsumer`**

Add to `ToonyAgentConsumer` class (after `config_update_status`, line 741):

```python
async def repo_clone_result(self, event):
    await self.send_json({"type": "repo.clone.result", **event["data"]})
```

**Step 4: Commit**

```
feat(toony_agents): handle repo.clone.result in WebSocket consumer
```

---

### Task 5: Runner — skip folder creation for projects with `repository_url`

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/workspace.py:43-46`
- Modify: `toony_agent_runner/tests/test_workspace.py`

**Important note:** The backend sends `repository_url` in the config.sync payload (see `workspace_config_selector.py:41`), but the runner currently reads `proj.get("repo", "")` in `workspace.py:54`. The runner should use `repository_url` to be consistent. Update the registry entry to store `repository_url` too.

**Step 1: Write the failing test**

Add to `toony_agent_runner/tests/test_workspace.py`:

First update the `_make_project` helper to support `repository_url`:

```python
def _make_project(
    *,
    slug: str = "backend-api",
    name: str = "Backend API",
    project_id: str = "proj-1",
    repo: str = "acme/backend-api",
    repository_url: str = "",
    base_branch: str = "main",
    branch_convention: str = "feat/{issue_prefix}-{issue_number}-{slug}",
    default_reviewers: list | None = None,
    issue_prefix: str = "ENG",
) -> dict:
    return {
        "slug": slug,
        "name": name,
        "id": project_id,
        "repo": repo,
        "repository_url": repository_url,
        "base_branch": base_branch,
        "branch_convention": branch_convention,
        "default_reviewers": default_reviewers or [],
        "issue_prefix": issue_prefix,
    }
```

Then add a new test class:

```python
class TestProcessConfigSyncRepoUrl:
    """Projects with repository_url should NOT have their directory created."""

    def test_skips_dir_for_project_with_repository_url(self, tmp_path: Path):
        projects = [
            _make_project(slug="cloned-repo", project_id="p-1", repository_url="https://github.com/org/repo.git"),
        ]
        data = {"organizations": [_make_org(projects=projects)]}
        result = process_config_sync(data, tmp_path)

        proj_dir = tmp_path / "acme-corp" / "projects" / "cloned-repo"
        assert not proj_dir.exists(), "Directory should not be created for projects with repository_url"
        assert result["p-1"] == proj_dir

    def test_creates_dir_for_project_without_repository_url(self, tmp_path: Path):
        projects = [
            _make_project(slug="no-repo", project_id="p-1", repository_url=""),
        ]
        data = {"organizations": [_make_org(projects=projects)]}
        process_config_sync(data, tmp_path)

        proj_dir = tmp_path / "acme-corp" / "projects" / "no-repo"
        assert proj_dir.is_dir()

    def test_mixed_projects(self, tmp_path: Path):
        projects = [
            _make_project(slug="with-repo", project_id="p-1", repository_url="https://github.com/org/repo.git"),
            _make_project(slug="without-repo", project_id="p-2", repository_url=""),
        ]
        data = {"organizations": [_make_org(projects=projects)]}
        result = process_config_sync(data, tmp_path)

        assert not (tmp_path / "acme-corp" / "projects" / "with-repo").exists()
        assert (tmp_path / "acme-corp" / "projects" / "without-repo").is_dir()
        assert "p-1" in result
        assert "p-2" in result
```

**Step 2: Run tests to verify they fail**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_workspace.py::TestProcessConfigSyncRepoUrl -v`
Expected: FAIL (directory is created for projects with `repository_url`)

**Step 3: Modify `process_config_sync()`**

In `toony_agent_runner/toony_agent_runner/workspace.py`, change lines 43-46 from:

```python
        for proj in org.get("projects", []):
            proj_slug: str = proj["slug"]
            proj_dir = org_dir / "projects" / proj_slug
            proj_dir.mkdir(parents=True, exist_ok=True)
```

To:

```python
        for proj in org.get("projects", []):
            proj_slug: str = proj["slug"]
            proj_dir = org_dir / "projects" / proj_slug

            if not proj.get("repository_url"):
                proj_dir.mkdir(parents=True, exist_ok=True)
```

**Step 4: Also update the registry entry to use `repository_url`**

In `workspace.py`, change line 54 from:

```python
                "repo": proj.get("repo", ""),
```

To:

```python
                "repo": proj.get("repo", ""),
                "repository_url": proj.get("repository_url", ""),
```

**Step 5: Run tests to verify they pass**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_workspace.py -v`
Expected: ALL PASS

**Step 6: Commit**

```
feat(runner): skip folder creation for projects with repository_url
```

---

### Task 6: Runner — `RepoCloneResultMessage` protocol message

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/protocol.py`

**Step 1: Add the outgoing message dataclass**

Add after `ConfigSyncAckMessage` (around line 233) in `protocol.py`:

```python
@dataclass
class RepoCloneResultMessage:
    """Reports the result of cloning a project repository."""

    project_id: str
    organization_id: str
    status: str  # "success" | "error"
    repository_url: str
    branch: str = ""
    clone_duration_ms: int = 0
    error: str = ""

    def to_json(self) -> dict:
        msg: dict[str, Any] = {
            "type": "repo.clone.result",
            "project_id": self.project_id,
            "organization_id": self.organization_id,
            "status": self.status,
            "repository_url": self.repository_url,
        }
        if self.status == "success":
            msg["branch"] = self.branch
            msg["clone_duration_ms"] = self.clone_duration_ms
        else:
            msg["error"] = self.error
        return msg
```

**Step 2: Update the module docstring at line 1-12**

Add `RepoCloneResultMessage` to the outgoing messages listed in the docstring.

**Step 3: Commit**

```
feat(runner): add RepoCloneResultMessage protocol type
```

---

### Task 7: Runner — `clone_pending_repos()` function

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/workspace.py`
- Modify: `toony_agent_runner/tests/test_workspace.py`

**Step 1: Write the failing tests**

Add to `toony_agent_runner/tests/test_workspace.py`:

```python
class TestClonePendingRepos:
    """Verify clone_pending_repos clones repos and reports results."""

    @pytest.fixture
    def mock_conn(self):
        """Mock WebSocket connection that records sent messages."""
        class FakeConn:
            def __init__(self):
                self.sent = []
            async def send(self, data):
                self.sent.append(data)
        return FakeConn()

    @pytest.mark.asyncio
    async def test_clones_repo_when_no_git_dir(self, tmp_path, mock_conn, monkeypatch):
        from toony_agent_runner.workspace import clone_pending_repos

        proj_dir = tmp_path / "acme" / "projects" / "my-repo"
        project_map = {"p-1": proj_dir}
        config_data = {
            "organizations": [
                _make_org(projects=[
                    _make_project(
                        slug="my-repo", project_id="p-1",
                        repository_url="https://github.com/org/repo.git",
                        base_branch="main",
                    ),
                ]),
            ],
        }

        async def fake_clone(url, dest, branch):
            dest.mkdir(parents=True, exist_ok=True)
            (dest / ".git").mkdir()

        monkeypatch.setattr("toony_agent_runner.workspace._async_git_clone", fake_clone)

        await clone_pending_repos(project_map, config_data, mock_conn)

        assert len(mock_conn.sent) == 1
        msg = mock_conn.sent[0]
        assert msg["type"] == "repo.clone.result"
        assert msg["status"] == "success"
        assert msg["project_id"] == "p-1"

    @pytest.mark.asyncio
    async def test_skips_already_cloned(self, tmp_path, mock_conn, monkeypatch):
        from toony_agent_runner.workspace import clone_pending_repos

        proj_dir = tmp_path / "acme" / "projects" / "my-repo"
        proj_dir.mkdir(parents=True)
        (proj_dir / ".git").mkdir()  # Already cloned

        project_map = {"p-1": proj_dir}
        config_data = {
            "organizations": [
                _make_org(projects=[
                    _make_project(
                        slug="my-repo", project_id="p-1",
                        repository_url="https://github.com/org/repo.git",
                    ),
                ]),
            ],
        }

        await clone_pending_repos(project_map, config_data, mock_conn)

        assert len(mock_conn.sent) == 0

    @pytest.mark.asyncio
    async def test_skips_projects_without_repository_url(self, tmp_path, mock_conn):
        from toony_agent_runner.workspace import clone_pending_repos

        proj_dir = tmp_path / "acme" / "projects" / "no-repo"
        project_map = {"p-1": proj_dir}
        config_data = {
            "organizations": [
                _make_org(projects=[
                    _make_project(slug="no-repo", project_id="p-1", repository_url=""),
                ]),
            ],
        }

        await clone_pending_repos(project_map, config_data, mock_conn)

        assert len(mock_conn.sent) == 0

    @pytest.mark.asyncio
    async def test_reports_error_on_clone_failure(self, tmp_path, mock_conn, monkeypatch):
        from toony_agent_runner.workspace import clone_pending_repos

        proj_dir = tmp_path / "acme" / "projects" / "fail-repo"
        project_map = {"p-1": proj_dir}
        config_data = {
            "organizations": [
                _make_org(projects=[
                    _make_project(
                        slug="fail-repo", project_id="p-1",
                        repository_url="https://github.com/org/private.git",
                    ),
                ]),
            ],
        }

        async def failing_clone(url, dest, branch):
            raise RuntimeError("Authentication failed")

        monkeypatch.setattr("toony_agent_runner.workspace._async_git_clone", failing_clone)

        await clone_pending_repos(project_map, config_data, mock_conn)

        assert len(mock_conn.sent) == 1
        msg = mock_conn.sent[0]
        assert msg["type"] == "repo.clone.result"
        assert msg["status"] == "error"
        assert "Authentication failed" in msg["error"]
```

**Step 2: Run tests to verify they fail**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_workspace.py::TestClonePendingRepos -v`
Expected: FAIL (function does not exist)

**Step 3: Implement `clone_pending_repos` and `_async_git_clone`**

Add to `toony_agent_runner/toony_agent_runner/workspace.py`:

At the top, add imports:
```python
import asyncio
import logging
import time

from toony_agent_runner.protocol import RepoCloneResultMessage
```

Then add before `resolve_project_path`:

```python
logger = logging.getLogger(__name__)


async def _async_git_clone(url: str, dest: Path, branch: str = "main") -> None:
    """Clone a git repository using the system git CLI."""
    cmd = ["git", "clone", "--branch", branch, "--single-branch", url, str(dest)]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(stderr.decode().strip() or f"git clone exited with code {proc.returncode}")


async def clone_pending_repos(
    project_map: dict[str, Path],
    config_data: dict[str, Any],
    conn,
) -> None:
    """Clone repositories for projects that have repository_url but no .git/ directory.

    Sends a ``repo.clone.result`` message per project to the backend.
    """
    for org in config_data.get("organizations", []):
        org_id = org.get("id", "")
        for proj in org.get("projects", []):
            repo_url = proj.get("repository_url")
            if not repo_url:
                continue

            proj_dir = project_map.get(proj["id"])
            if proj_dir is None:
                continue

            if (proj_dir / ".git").exists():
                logger.debug("Repo already cloned: %s", proj_dir)
                continue

            branch = proj.get("base_branch", "main")
            start = time.monotonic()
            try:
                await _async_git_clone(repo_url, proj_dir, branch=branch)
                duration_ms = int((time.monotonic() - start) * 1000)
                logger.info("Cloned %s -> %s (%dms)", repo_url, proj_dir, duration_ms)
                await conn.send(
                    RepoCloneResultMessage(
                        project_id=proj["id"],
                        organization_id=org_id,
                        status="success",
                        repository_url=repo_url,
                        branch=branch,
                        clone_duration_ms=duration_ms,
                    ).to_json()
                )
            except Exception as exc:
                logger.error("Failed to clone %s: %s", repo_url, exc)
                await conn.send(
                    RepoCloneResultMessage(
                        project_id=proj["id"],
                        organization_id=org_id,
                        status="error",
                        repository_url=repo_url,
                        error=str(exc),
                    ).to_json()
                )
```

**Step 4: Run tests to verify they pass**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_workspace.py -v`
Expected: ALL PASS

**Step 5: Commit**

```
feat(runner): add clone_pending_repos function
```

---

### Task 8: Runner — integrate `clone_pending_repos` into `main.py`

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/main.py:324-360`

**Step 1: Add import**

Add at the top of `main.py`, alongside the existing `process_config_sync` import:

```python
from toony_agent_runner.workspace import process_config_sync, resolve_project_path, clone_pending_repos
```

**Step 2: Modify the ConfigSync handler**

In `main.py`, the current ConfigSync handler (lines 324-360) calls `process_config_sync` and then sends the ack. Insert `clone_pending_repos` between them.

Change the try block inside `elif isinstance(msg, ConfigSync):` from:

```python
                    try:
                        project_map = process_config_sync(
                            {"organizations": msg.organizations},
                            workspace_root,
                        )
                        total_projects = sum(
                            len(o.get("projects", []))
                            for o in msg.organizations
                        )
                        await conn.send(
                            ConfigSyncAckMessage(
                                success=True,
                                org_count=len(msg.organizations),
                                project_count=total_projects,
                            ).to_json()
                        )
                        logger.info(
                            "Config sync complete: %d orgs, %d projects",
                            len(msg.organizations), total_projects,
                        )
```

To:

```python
                    try:
                        config_payload = {"organizations": msg.organizations}
                        project_map = process_config_sync(
                            config_payload,
                            workspace_root,
                        )
                        await clone_pending_repos(project_map, config_payload, conn)
                        total_projects = sum(
                            len(o.get("projects", []))
                            for o in msg.organizations
                        )
                        await conn.send(
                            ConfigSyncAckMessage(
                                success=True,
                                org_count=len(msg.organizations),
                                project_count=total_projects,
                            ).to_json()
                        )
                        logger.info(
                            "Config sync complete: %d orgs, %d projects",
                            len(msg.organizations), total_projects,
                        )
```

**Step 3: Commit**

```
feat(runner): call clone_pending_repos during config sync
```

---

### Task 9: Backend tests for WebSocket consumer handler

**Files:**
- Modify: `backend/tests/test_toony_agents.py`

**Step 1: Write tests for the consumer handler**

Add to `backend/tests/test_toony_agents.py`:

```python
class TestAgentSystemEventModel:
    def test_create_system_event(self, toony_agent, organization, project):
        from toony_agents.models import AgentSystemEvent, AgentSystemEventType

        event = AgentSystemEvent.objects.create(
            toony_agent=toony_agent,
            event_type=AgentSystemEventType.REPO_CLONE_SUCCESS,
            organization=organization,
            project=project,
            data={"repository_url": "https://github.com/org/repo.git", "branch": "main", "clone_duration_ms": 1500},
        )
        assert event.event_type == AgentSystemEventType.REPO_CLONE_SUCCESS
        assert event.data["repository_url"] == "https://github.com/org/repo.git"
        assert event.toony_agent == toony_agent
        assert event.organization == organization
        assert event.project == project

    def test_create_system_event_without_org_project(self, toony_agent):
        from toony_agents.models import AgentSystemEvent, AgentSystemEventType

        event = AgentSystemEvent.objects.create(
            toony_agent=toony_agent,
            event_type=AgentSystemEventType.CONFIG_SYNC_COMPLETED,
            data={"org_count": 2, "project_count": 5},
        )
        assert event.organization is None
        assert event.project is None

    def test_system_events_ordered_by_most_recent(self, toony_agent):
        from toony_agents.models import AgentSystemEvent, AgentSystemEventType

        e1 = AgentSystemEvent.objects.create(
            toony_agent=toony_agent,
            event_type=AgentSystemEventType.REPO_CLONE_SUCCESS,
            data={},
        )
        e2 = AgentSystemEvent.objects.create(
            toony_agent=toony_agent,
            event_type=AgentSystemEventType.REPO_CLONE_ERROR,
            data={},
        )
        events = list(AgentSystemEvent.objects.filter(toony_agent=toony_agent))
        assert events[0].id == e2.id  # Most recent first
        assert events[1].id == e1.id
```

**Step 2: Run tests**

Run: `docker compose exec backend pytest tests/test_toony_agents.py::TestAgentSystemEventModel -v`
Expected: PASS

**Step 3: Commit**

```
test(toony_agents): add system event model tests
```

---

### Task 10: Run full test suites

**Step 1: Run backend tests**

Run: `make test`
Expected: ALL PASS

**Step 2: Run runner tests**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/ -v`
Expected: ALL PASS

**Step 3: Run backend lint**

Run: `make lint`
Expected: PASS

**Step 4: Final commit (if any lint fixes needed)**

```
chore: fix lint issues
```
