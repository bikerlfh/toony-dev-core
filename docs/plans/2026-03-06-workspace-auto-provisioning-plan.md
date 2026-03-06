# Workspace Auto-Provisioning Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When a runner connects, the backend sends org+project config; the runner auto-provisions directories and YAML files. Users can also trigger sync from the frontend.

**Architecture:** New `config.sync` WebSocket message from backend to runner (on register + on-demand). Runner creates dirs and writes `workspace-registry.yaml` per org. Frontend gets a "Sync Config" button that triggers the same flow via channel layer.

**Tech Stack:** Django Channels (backend consumers), Python asyncio + YAML (runner), React + Tailwind (frontend button + WS hook)

---

### Task 1: Runner Protocol — Add ConfigSync and ConfigSyncAck messages

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/protocol.py`
- Test: `toony_agent_runner/tests/test_protocol.py`

**Step 1: Write failing tests**

Add to `toony_agent_runner/tests/test_protocol.py`:

```python
from toony_agent_runner.protocol import (
    CommandExecute,
    CommandResultMessage,
    ConfigSync,
    ConfigSyncAckMessage,
    TaskAssign,
    parse_server_message,
)


class TestConfigSync:
    def test_parse_config_sync(self):
        raw = {
            "type": "config.sync",
            "organizations": [
                {
                    "id": "org-uuid-1",
                    "name": "MyOrg",
                    "slug": "myorg",
                    "integrations": {"pm": "linear", "git": "github"},
                    "defaults": {"base_branch": "main"},
                    "projects": [
                        {
                            "id": "proj-uuid-1",
                            "name": "Backend",
                            "slug": "backend",
                            "repository_url": "https://github.com/org/backend.git",
                            "base_branch": "main",
                            "branch_convention": "",
                            "default_reviewers": [],
                            "issue_prefix": "ENG",
                        }
                    ],
                }
            ],
        }
        msg = parse_server_message(raw)
        assert isinstance(msg, ConfigSync)
        assert len(msg.organizations) == 1
        assert msg.organizations[0]["slug"] == "myorg"
        assert len(msg.organizations[0]["projects"]) == 1

    def test_parse_config_sync_empty_orgs(self):
        raw = {"type": "config.sync", "organizations": []}
        msg = parse_server_message(raw)
        assert isinstance(msg, ConfigSync)
        assert msg.organizations == []


class TestConfigSyncAckMessage:
    def test_success_to_json(self):
        msg = ConfigSyncAckMessage(success=True, org_count=2, project_count=5)
        j = msg.to_json()
        assert j == {
            "type": "config.sync.ack",
            "success": True,
            "org_count": 2,
            "project_count": 5,
            "error": "",
        }

    def test_failure_to_json(self):
        msg = ConfigSyncAckMessage(success=False, error="disk full")
        j = msg.to_json()
        assert j["success"] is False
        assert j["error"] == "disk full"
        assert j["org_count"] == 0


class TestTaskAssignProjectId:
    def test_parse_task_assign_with_project_id(self):
        raw = {
            "type": "task.assign",
            "task_id": "task-1",
            "title": "Fix bug",
            "prompt": "Fix the login bug",
            "project_id": "proj-uuid-1",
        }
        msg = parse_server_message(raw)
        assert isinstance(msg, TaskAssign)
        assert msg.project_id == "proj-uuid-1"

    def test_parse_task_assign_without_project_id(self):
        raw = {
            "type": "task.assign",
            "task_id": "task-1",
            "title": "Fix bug",
            "prompt": "Fix the login bug",
        }
        msg = parse_server_message(raw)
        assert isinstance(msg, TaskAssign)
        assert msg.project_id is None
```

**Step 2: Run tests to verify they fail**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_protocol.py -v`
Expected: ImportError for `ConfigSync`, `ConfigSyncAckMessage`

**Step 3: Implement protocol additions**

In `toony_agent_runner/toony_agent_runner/protocol.py`:

1. Add `ConfigSync` incoming dataclass:

```python
@dataclass
class ConfigSync:
    """Backend sends workspace config (orgs + projects) to runner."""

    organizations: list[dict[str, Any]]
```

2. Add `ConfigSyncAckMessage` outgoing dataclass:

```python
@dataclass
class ConfigSyncAckMessage:
    """Runner confirms config sync completed."""

    success: bool
    org_count: int = 0
    project_count: int = 0
    error: str = ""

    def to_json(self) -> dict:
        return {
            "type": "config.sync.ack",
            "success": self.success,
            "org_count": self.org_count,
            "project_count": self.project_count,
            "error": self.error,
        }
```

3. Add `project_id: str | None = None` field to `TaskAssign` dataclass.

4. Update `parse_server_message`:
   - Add `config.sync` case returning `ConfigSync(organizations=data.get("organizations", []))`
   - Add `project_id=data.get("project_id")` to the `task.assign` case

5. Update `IncomingMessage` type alias to include `ConfigSync`.

6. Update the module docstring to mention the new messages.

**Step 4: Run tests to verify they pass**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_protocol.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/protocol.py toony_agent_runner/tests/test_protocol.py
git commit -m "feat(runner): add ConfigSync and ConfigSyncAck protocol messages"
```

---

### Task 2: Runner — workspace.py module (sync logic)

**Files:**
- Create: `toony_agent_runner/toony_agent_runner/workspace.py`
- Create: `toony_agent_runner/tests/test_workspace.py`

**Step 1: Write failing tests**

Create `toony_agent_runner/tests/test_workspace.py`:

```python
"""Tests for workspace auto-provisioning."""

from __future__ import annotations

import yaml
import pytest
from pathlib import Path

from toony_agent_runner.workspace import process_config_sync, resolve_project_path


@pytest.fixture
def workspace_root(tmp_path):
    return tmp_path / "work"


SAMPLE_CONFIG = {
    "organizations": [
        {
            "id": "org-uuid-1",
            "name": "MyOrg",
            "slug": "myorg",
            "integrations": {
                "pm": "linear",
                "git": "github",
                "linear_team": "ENG",
            },
            "defaults": {
                "base_branch": "main",
                "branch_convention": "feat/{issue_prefix}-{issue_number}-{slug}",
                "default_reviewers": [],
            },
            "projects": [
                {
                    "id": "proj-uuid-1",
                    "name": "Backend API",
                    "slug": "backend-api",
                    "repository_url": "https://github.com/org/backend-api.git",
                    "base_branch": "main",
                    "branch_convention": "feat/ENG-{issue_number}-{slug}",
                    "default_reviewers": ["senior-dev"],
                    "issue_prefix": "ENG",
                },
                {
                    "id": "proj-uuid-2",
                    "name": "Frontend",
                    "slug": "frontend",
                    "repository_url": "",
                    "base_branch": "develop",
                    "branch_convention": "",
                    "default_reviewers": [],
                    "issue_prefix": "FE",
                },
            ],
        }
    ]
}


class TestProcessConfigSync:
    def test_creates_org_directory(self, workspace_root):
        project_map = process_config_sync(SAMPLE_CONFIG, workspace_root)
        assert (workspace_root / "myorg" / ".toony").is_dir()

    def test_creates_project_directories(self, workspace_root):
        process_config_sync(SAMPLE_CONFIG, workspace_root)
        assert (workspace_root / "myorg" / "projects" / "backend-api").is_dir()
        assert (workspace_root / "myorg" / "projects" / "frontend").is_dir()

    def test_writes_workspace_registry_yaml(self, workspace_root):
        process_config_sync(SAMPLE_CONFIG, workspace_root)
        registry_path = workspace_root / "myorg" / ".toony" / "workspace-registry.yaml"
        assert registry_path.exists()
        content = yaml.safe_load(registry_path.read_text())
        assert content["organization"] == "MyOrg"
        assert content["organization_id"] == "org-uuid-1"
        assert content["integrations"]["pm"] == "linear"
        assert len(content["projects"]) == 2
        assert content["projects"][0]["slug"] == "backend-api"

    def test_returns_project_map(self, workspace_root):
        project_map = process_config_sync(SAMPLE_CONFIG, workspace_root)
        assert "proj-uuid-1" in project_map
        assert project_map["proj-uuid-1"] == workspace_root / "myorg" / "projects" / "backend-api"
        assert "proj-uuid-2" in project_map

    def test_overwrites_existing_registry(self, workspace_root):
        process_config_sync(SAMPLE_CONFIG, workspace_root)
        # Modify the config
        modified = {
            "organizations": [
                {
                    **SAMPLE_CONFIG["organizations"][0],
                    "name": "MyOrg Renamed",
                    "projects": [],
                }
            ]
        }
        process_config_sync(modified, workspace_root)
        registry_path = workspace_root / "myorg" / ".toony" / "workspace-registry.yaml"
        content = yaml.safe_load(registry_path.read_text())
        assert content["organization"] == "MyOrg Renamed"
        assert content["projects"] == []

    def test_does_not_touch_local_yaml(self, workspace_root):
        # Create a local.yaml before sync
        proj_dir = workspace_root / "myorg" / "projects" / "backend-api" / ".toony"
        proj_dir.mkdir(parents=True)
        local_yaml = proj_dir / "local.yaml"
        local_yaml.write_text("deploy_cmd: make deploy\n")

        process_config_sync(SAMPLE_CONFIG, workspace_root)
        assert local_yaml.read_text() == "deploy_cmd: make deploy\n"

    def test_empty_organizations(self, workspace_root):
        project_map = process_config_sync({"organizations": []}, workspace_root)
        assert project_map == {}

    def test_multiple_organizations(self, workspace_root):
        config = {
            "organizations": [
                SAMPLE_CONFIG["organizations"][0],
                {
                    "id": "org-uuid-2",
                    "name": "OtherCorp",
                    "slug": "othercorp",
                    "integrations": {},
                    "defaults": {},
                    "projects": [],
                },
            ]
        }
        project_map = process_config_sync(config, workspace_root)
        assert (workspace_root / "myorg" / ".toony").is_dir()
        assert (workspace_root / "othercorp" / ".toony").is_dir()

    def test_idempotent(self, workspace_root):
        process_config_sync(SAMPLE_CONFIG, workspace_root)
        project_map = process_config_sync(SAMPLE_CONFIG, workspace_root)
        assert len(project_map) == 2


class TestResolveProjectPath:
    def test_resolves_known_project(self, workspace_root):
        project_map = process_config_sync(SAMPLE_CONFIG, workspace_root)
        path = resolve_project_path("proj-uuid-1", project_map)
        assert path == workspace_root / "myorg" / "projects" / "backend-api"

    def test_returns_none_for_unknown_project(self, workspace_root):
        project_map = process_config_sync(SAMPLE_CONFIG, workspace_root)
        path = resolve_project_path("unknown-uuid", project_map)
        assert path is None

    def test_returns_none_for_none_project_id(self, workspace_root):
        project_map = process_config_sync(SAMPLE_CONFIG, workspace_root)
        path = resolve_project_path(None, project_map)
        assert path is None
```

**Step 2: Run tests to verify they fail**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_workspace.py -v`
Expected: ImportError for `workspace` module

**Step 3: Implement workspace.py**

Create `toony_agent_runner/toony_agent_runner/workspace.py`:

```python
"""Workspace auto-provisioning: create dirs, write YAML from config.sync data."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger(__name__)


def process_config_sync(
    data: dict[str, Any],
    workspace_root: Path,
) -> dict[str, Path]:
    """Process a config.sync payload: create dirs, write YAML, return project map.

    Parameters
    ----------
    data:
        The parsed config.sync message (has ``organizations`` key).
    workspace_root:
        Base directory for all org workspaces.

    Returns
    -------
    dict mapping project_id -> local Path for each project.
    """
    workspace_root.mkdir(parents=True, exist_ok=True)
    project_map: dict[str, Path] = {}

    for org in data.get("organizations", []):
        org_slug = org["slug"]
        org_dir = workspace_root / org_slug
        toony_dir = org_dir / ".toony"
        toony_dir.mkdir(parents=True, exist_ok=True)

        projects_dir = org_dir / "projects"
        projects_dir.mkdir(parents=True, exist_ok=True)

        # Create project directories and build map.
        projects = org.get("projects", [])
        for proj in projects:
            proj_dir = projects_dir / proj["slug"]
            proj_dir.mkdir(parents=True, exist_ok=True)
            project_map[proj["id"]] = proj_dir

        # Write workspace-registry.yaml (full overwrite).
        registry = {
            "organization": org["name"],
            "organization_id": org["id"],
            "integrations": org.get("integrations", {}),
            "defaults": org.get("defaults", {}),
            "projects": [
                {
                    "name": p["name"],
                    "id": p["id"],
                    "slug": p["slug"],
                    "repo": p.get("repository_url", ""),
                    "base_branch": p.get("base_branch", "main"),
                    "branch_convention": p.get("branch_convention", ""),
                    "default_reviewers": p.get("default_reviewers", []),
                    "issue_prefix": p.get("issue_prefix", ""),
                }
                for p in projects
            ],
        }

        registry_path = toony_dir / "workspace-registry.yaml"
        header = (
            f"# MANAGED BY TOONY -- DO NOT EDIT\n"
            f"# Last synced: {datetime.now(timezone.utc).isoformat()}\n\n"
        )
        registry_path.write_text(
            header + yaml.dump(registry, default_flow_style=False, sort_keys=False)
        )
        logger.info(
            "Wrote workspace registry for %s (%d projects)",
            org_slug, len(projects),
        )

    return project_map


def resolve_project_path(
    project_id: str | None,
    project_map: dict[str, Path],
) -> Path | None:
    """Resolve a project_id to its local path, or None if unknown."""
    if project_id is None:
        return None
    return project_map.get(project_id)
```

**Step 4: Run tests to verify they pass**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_workspace.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/workspace.py toony_agent_runner/tests/test_workspace.py
git commit -m "feat(runner): add workspace.py for config sync provisioning"
```

---

### Task 3: Runner — Integrate config sync into main.py

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/main.py`

**Step 1: Add `workspace_root` to RunnerConfig**

In the `RunnerConfig` dataclass (line 113), add:

```python
workspace_root: str = ""
```

In `load_config()` (around line 133), add:

```python
workspace_root=raw.get("workspace_root", ""),
```

**Step 2: Import new protocol types and workspace module**

Add to imports at top of `main.py`:

```python
from .protocol import (
    # ... existing imports ...
    ConfigSync,
    ConfigSyncAckMessage,
)
from .workspace import process_config_sync, resolve_project_path
```

**Step 3: Add project_map state and ConfigSync handler to main loop**

In `run()` function, after `max_tasks = config.claude.max_concurrent_tasks` (line 745), add:

```python
project_map: dict[str, Path] = {}
workspace_root = Path(config.workspace_root).expanduser().resolve() if config.workspace_root else None
```

In the message handling block (after the `isinstance(msg, CommandExecute)` elif, around line 914), add:

```python
elif isinstance(msg, ConfigSync):
    logger.info("Received config.sync with %d organizations", len(msg.organizations))
    if workspace_root:
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
        except Exception as exc:
            logger.error("Config sync failed: %s", exc)
            await conn.send(
                ConfigSyncAckMessage(
                    success=False, error=str(exc)
                ).to_json()
            )
    else:
        logger.warning("Received config.sync but workspace_root not configured, skipping")
        await conn.send(
            ConfigSyncAckMessage(
                success=False, error="workspace_root not configured"
            ).to_json()
        )
```

**Step 4: Pass project_id cwd to execute_task**

In the `TaskAssign` handler (around line 843), after `logger.info(...)`, resolve the project path and pass a custom config:

```python
# Resolve project-specific working directory.
task_cwd = None
if msg.project_id and workspace_root:
    task_cwd = resolve_project_path(msg.project_id, project_map)
    if task_cwd:
        logger.info("Task %s will run in %s", msg.task_id, task_cwd)

# Build a per-task config with the resolved cwd.
task_config = config
if task_cwd and task_cwd.exists():
    from copy import copy
    task_config = copy(config)
    task_config.claude = copy(config.claude)
    task_config.claude.working_directory = str(task_cwd)
```

Then pass `task_config` instead of `config` to `execute_task()`:

```python
active_tasks[msg.task_id] = asyncio.create_task(
    execute_task(
        msg.task_id, msg.prompt, conn, task_config, ce
    )
)
```

Do the same for `TaskReply` handler — resolve `project_id` is not needed since task.reply doesn't carry project_id (it resumes an existing session with its own cwd).

**Step 5: Run existing tests to verify nothing breaks**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/ -v`
Expected: All existing tests PASS

**Step 6: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/main.py
git commit -m "feat(runner): integrate config.sync into main loop with project cwd routing"
```

---

### Task 4: Backend — Add project FK to AgentTask model

**Files:**
- Modify: `backend/toony_agents/models/agent_task.py`
- Create: `backend/toony_agents/migrations/0004_add_project_to_agent_task.py` (auto-generated)

**Step 1: Add project field to AgentTask**

In `backend/toony_agents/models/agent_task.py`, after the `organization` field (line 18-24), add:

```python
project = models.ForeignKey(
    "projects.Project",
    on_delete=models.SET_NULL,
    null=True,
    blank=True,
    related_name="agent_tasks",
)
```

**Step 2: Generate and apply migration**

Run: `make makemigrations` then `make migrate`

**Step 3: Run backend tests to verify nothing breaks**

Run: `make test`
Expected: All PASS

**Step 4: Commit**

```bash
git add backend/toony_agents/models/agent_task.py backend/toony_agents/migrations/
git commit -m "feat(backend): add project FK to AgentTask model"
```

---

### Task 5: Backend — Workspace config selector

**Files:**
- Create: `backend/toony_agents/selectors/workspace_config_selector.py`
- Modify: `backend/tests/test_toony_agents.py`

**Step 1: Write failing test**

Add to `backend/tests/test_toony_agents.py` (or create a new test class at the end):

```python
class TestWorkspaceConfigSelector(TestCase):
    def setUp(self):
        self.user = UserFactory()
        self.org = OrganizationFactory()
        OrganizationMembershipFactory(user=self.user, organization=self.org)
        self.agent = ToonyAgentFactory(registered_by=self.user)
        self.agent.organizations.add(self.org)

    def test_returns_agent_organizations_with_projects(self):
        from toony_agents.selectors.workspace_config_selector import (
            get_agent_workspace_config,
        )
        project = ProjectFactory(organization=self.org)
        ProjectSettingsFactory(project=project)

        config = get_agent_workspace_config(str(self.agent.id))
        self.assertEqual(len(config), 1)
        self.assertEqual(config[0]["slug"], self.org.slug)
        self.assertEqual(len(config[0]["projects"]), 1)
        self.assertEqual(config[0]["projects"][0]["slug"], project.slug)

    def test_returns_empty_for_agent_with_no_orgs(self):
        from toony_agents.selectors.workspace_config_selector import (
            get_agent_workspace_config,
        )
        self.agent.organizations.clear()
        config = get_agent_workspace_config(str(self.agent.id))
        self.assertEqual(config, [])
```

Note: Check if `ToonyAgentFactory`, `ProjectFactory`, and `ProjectSettingsFactory` exist in `tests/factories.py`. If not, create them following existing factory patterns. `ProjectSettingsFactory` should create a `ProjectSettings` for the given project.

**Step 2: Run test to verify it fails**

Run: `docker compose exec backend pytest tests/test_toony_agents.py::TestWorkspaceConfigSelector -v`
Expected: ImportError for `workspace_config_selector`

**Step 3: Implement the selector**

Create `backend/toony_agents/selectors/workspace_config_selector.py`:

```python
from toony_agents.models import ToonyAgent
from organizations.models import IntegrationConfig


def get_agent_workspace_config(agent_id):
    """Build the config.sync payload for a given agent.

    Returns a list of org dicts with nested projects, ready to be sent
    as the ``organizations`` field in a config.sync message.
    """
    try:
        agent = ToonyAgent.objects.prefetch_related(
            "organizations__projects__settings",
            "organizations__projects__memberships__user",
            "organizations__integration_configs",
        ).get(id=agent_id)
    except ToonyAgent.DoesNotExist:
        return []

    result = []
    for org in agent.organizations.all():
        # Build integrations from IntegrationConfig.
        integrations = {}
        for ic in org.integration_configs.filter(is_active=True):
            provider = ic.provider.lower()
            integrations["pm"] = provider

        # Build project list.
        projects = []
        for proj in org.projects.all():
            settings = getattr(proj, "settings", None)
            reviewers = []
            if settings:
                # Get reviewers from project memberships with REVIEWER role.
                reviewer_memberships = proj.memberships.filter(role="REVIEWER")
                reviewers = [
                    m.user.email for m in reviewer_memberships.select_related("user")
                ]

            projects.append({
                "id": str(proj.id),
                "name": proj.name,
                "slug": proj.slug,
                "repository_url": settings.repository_url if settings else "",
                "base_branch": settings.default_branch if settings else "main",
                "branch_convention": settings.branch_naming_convention if settings else "",
                "default_reviewers": reviewers,
                "issue_prefix": settings.issue_prefix_override if settings else "",
            })

        result.append({
            "id": str(org.id),
            "name": org.name,
            "slug": org.slug,
            "integrations": integrations,
            "defaults": {
                "base_branch": "main",
                "branch_convention": "",
                "default_reviewers": [],
            },
            "projects": projects,
        })

    return result
```

**Step 4: Run tests to verify they pass**

Run: `docker compose exec backend pytest tests/test_toony_agents.py::TestWorkspaceConfigSelector -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/toony_agents/selectors/workspace_config_selector.py backend/tests/test_toony_agents.py
git commit -m "feat(backend): add workspace config selector for config.sync"
```

---

### Task 6: Backend — Send config.sync in RunnerConsumer on register

**Files:**
- Modify: `backend/toony_agents/consumers.py`

**Step 1: Add async DB helper**

At the top of `consumers.py`, add the import and async wrapper:

```python
from toony_agents.selectors.workspace_config_selector import (
    get_agent_workspace_config as _sync_get_workspace_config,
)

@database_sync_to_async
def _get_workspace_config(agent_id):
    return _sync_get_workspace_config(agent_id)
```

**Step 2: Send config.sync after register**

In `ToonyAgentRunnerConsumer.receive_json`, in the `register` handler (after the `group_send` for `agent_status` and before sending queued tasks, around line 201), add:

```python
# Send workspace config sync.
workspace_config = await _get_workspace_config(self.agent_id)
await self.send_json({
    "type": "config.sync",
    "organizations": workspace_config,
})
```

**Step 3: Handle config.sync.ack from runner**

In the `receive_json` method, add a new handler (after `command.result` if it existed, or before the `else` clause):

```python
elif msg_type == "config.sync.ack":
    success = content.get("success", False)
    logger.info(
        "Config sync ack from %s: success=%s orgs=%s projects=%s",
        self.agent_id, success,
        content.get("org_count", 0), content.get("project_count", 0),
    )
    # Forward ack to frontend.
    await self.channel_layer.group_send(
        self.frontend_group,
        {
            "type": "config_sync_status",
            "data": {
                "success": success,
                "org_count": content.get("org_count", 0),
                "project_count": content.get("project_count", 0),
                "error": content.get("error", ""),
            },
        },
    )
```

**Step 4: Add config_sync group handler for on-demand sync**

Add a group handler to `ToonyAgentRunnerConsumer` (after `task_reply` handler):

```python
async def config_sync_request(self, event):
    """Frontend requested config sync — query fresh data and send to runner."""
    workspace_config = await _get_workspace_config(self.agent_id)
    await self.send_json({
        "type": "config.sync",
        "organizations": workspace_config,
    })
```

**Step 5: Add project_id to task.assign in the `task_assign` group handler**

Update the `task_assign` handler to forward `project_id`:

```python
async def task_assign(self, event):
    msg = {
        "type": "task.assign",
        "task_id": event["data"]["task_id"],
        "prompt": event["data"]["prompt"],
        "title": event["data"]["title"],
    }
    if event["data"].get("project_id"):
        msg["project_id"] = event["data"]["project_id"]
    await self.send_json(msg)
```

Also update the queued task sending in the `register` handler to include `project_id`. Change `_get_queued_tasks` to also return `project_id`:

Update `_get_queued_tasks`:

```python
@database_sync_to_async
def _get_queued_tasks(agent_id):
    return list(
        AgentTask.objects.filter(
            toony_agent_id=agent_id,
            status=AgentTaskStatus.QUEUED,
        ).values("id", "title", "prompt", "project_id")
    )
```

And the sending loop:

```python
for task in queued:
    msg = {
        "type": "task.assign",
        "task_id": str(task["id"]),
        "prompt": task["prompt"],
        "title": task["title"],
    }
    if task.get("project_id"):
        msg["project_id"] = str(task["project_id"])
    await self.send_json(msg)
```

**Step 6: Run backend tests**

Run: `make test`
Expected: All PASS

**Step 7: Commit**

```bash
git add backend/toony_agents/consumers.py
git commit -m "feat(backend): send config.sync on register and handle on-demand sync"
```

---

### Task 7: Backend — Handle config.sync.request in ToonyAgentConsumer (frontend-facing)

**Files:**
- Modify: `backend/toony_agents/consumers.py`

**Step 1: Add config.sync.request handler to ToonyAgentConsumer**

In `ToonyAgentConsumer.receive_json`, add a new `elif` branch (before the `else` clause, around line 536):

```python
elif msg_type == "config.sync.request":
    runner_group = f"toony_agent_runner_{self.agent_id}"
    await self.channel_layer.group_send(
        runner_group,
        {"type": "config_sync_request", "data": {}},
    )
```

**Step 2: Add config_sync_status group handler to ToonyAgentConsumer**

Add to the group handlers section (after `approval_needed`):

```python
async def config_sync_status(self, event):
    await self.send_json({"type": "config.sync.status", **event["data"]})
```

**Step 3: Run backend tests**

Run: `make test`
Expected: All PASS

**Step 4: Commit**

```bash
git add backend/toony_agents/consumers.py
git commit -m "feat(backend): handle config.sync.request in frontend consumer"
```

---

### Task 8: Frontend — Add ConfigSyncStatus WS type and sendConfigSync to hook

**Files:**
- Modify: `frontend/types/toony-agents.ts`
- Modify: `frontend/hooks/use-toony-agent-websocket.ts`

**Step 1: Add ConfigSyncStatus WS event type**

In `frontend/types/toony-agents.ts`, add:

```typescript
export interface ConfigSyncStatusWsEvent {
  type: "config.sync.status";
  success: boolean;
  org_count: number;
  project_count: number;
  error?: string;
}
```

Update the `ToonyAgentWsEvent` union:

```typescript
export type ToonyAgentWsEvent =
  | ToonyAgentStatusWsEvent
  | TaskStatusWsEvent
  | TaskEventWsEvent
  | ApprovalNeededWsEvent
  | ConfigSyncStatusWsEvent;
```

**Step 2: Add sendConfigSync to the WS hook**

In `frontend/hooks/use-toony-agent-websocket.ts`, add a new callback:

```typescript
const sendConfigSync = useCallback(() => {
  send({ type: "config.sync.request" });
}, [send]);
```

Add it to the return value:

```typescript
return { readyState, sendApproval, sendReply, cancelTask, sendConfigSync };
```

Update the return type to include `sendConfigSync: () => void`.

**Step 3: Commit**

```bash
git add frontend/types/toony-agents.ts frontend/hooks/use-toony-agent-websocket.ts
git commit -m "feat(frontend): add config.sync WS types and sendConfigSync hook"
```

---

### Task 9: Frontend — Add "Sync Config" button to toony agent detail page

**Files:**
- Modify: `frontend/app/(dashboard)/toony-agents/[id]/page.tsx`

**Step 1: Add sync state and handler**

In the page component, after the existing state declarations (around line 101), add:

```typescript
const [syncLoading, setSyncLoading] = useState(false);
const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);
```

**Step 2: Update the WS hook usage**

Update the destructured hook to include `sendConfigSync`:

```typescript
const { readyState, sendApproval, sendReply, cancelTask, sendConfigSync } =
  useToonyAgentWebSocket({
    agentId: agent?.id ?? null,
    onEvent: handleWsEvent,
  });
```

**Step 3: Handle config.sync.status in WS event handler**

In `handleWsEvent` (around line 140), add:

```typescript
} else if (event.type === "config.sync.status") {
  setSyncLoading(false);
  if (event.success) {
    setSyncResult({
      success: true,
      message: `Synced ${event.org_count} org(s), ${event.project_count} project(s)`,
    });
  } else {
    setSyncResult({
      success: false,
      message: event.error || "Sync failed",
    });
  }
  // Auto-clear after 5 seconds.
  setTimeout(() => setSyncResult(null), 5000);
}
```

**Step 4: Add Sync Config button**

In the header buttons area (around line 331, inside `<div className="flex shrink-0 gap-2">`), add before the existing buttons:

```tsx
{agent.status !== "OFFLINE" && (
  <button
    onClick={() => {
      setSyncLoading(true);
      setSyncResult(null);
      sendConfigSync();
    }}
    disabled={syncLoading}
    className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-slate-600 hover:text-white disabled:opacity-50"
  >
    {syncLoading ? "Syncing..." : "Sync Config"}
  </button>
)}
```

**Step 5: Add sync result feedback**

After the header div and before the metrics strip (around line 346), add:

```tsx
{syncResult && (
  <div
    className={`mt-3 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm ${
      syncResult.success
        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
        : "border-red-500/20 bg-red-500/10 text-red-400"
    }`}
  >
    <span>{syncResult.success ? "Synced" : "Failed"}:</span>
    <span className="text-slate-300">{syncResult.message}</span>
  </div>
)}
```

**Step 6: Verify build**

Run: `cd frontend && ./node_modules/.bin/next build` (or `make lint-frontend`)
Expected: No errors

**Step 7: Commit**

```bash
git add frontend/app/\(dashboard\)/toony-agents/\[id\]/page.tsx
git commit -m "feat(frontend): add Sync Config button to toony agent detail page"
```

---

### Task 10: Update config.example.yml and clean up old YAML files

**Files:**
- Modify: `toony_agent_runner/config.example.yml` (if exists, otherwise create)
- Delete: `toony_agent_runner/organizations.yaml`
- Delete: `toony_agent_runner/workspace-registry.example.yaml`

**Step 1: Update config.example.yml**

If `config.example.yml` exists, read it first. Add the `workspace_root` field:

```yaml
workspace_root: "~/work"
```

If it doesn't exist, create it with the full template from the design doc's "File Reference" section.

**Step 2: Remove old files**

The `organizations.yaml` and `workspace-registry.example.yaml` files are superseded by the auto-provisioning system. Remove them:

```bash
git rm toony_agent_runner/organizations.yaml
git rm toony_agent_runner/workspace-registry.example.yaml
```

**Step 3: Commit**

```bash
git add toony_agent_runner/
git commit -m "feat(runner): add workspace_root to config, remove old manual YAML files"
```

---

### Task 11: Final integration verification

**Step 1: Run all runner tests**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/ -v`
Expected: All PASS

**Step 2: Run all backend tests**

Run: `make test`
Expected: All PASS

**Step 3: Run frontend lint**

Run: `make lint-frontend`
Expected: No errors

**Step 4: Final commit (if any fixups needed)**

Only commit if fixups were needed. Otherwise, all work is already committed from previous tasks.
