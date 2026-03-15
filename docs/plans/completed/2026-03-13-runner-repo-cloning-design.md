# Runner Repository Cloning on Config Sync

## Problem

When a Toony Agent Runner connects and receives `config.sync`, it creates workspace folders for all organizations and projects but does not clone repositories. Projects with a configured `repository_url` should have their repos cloned automatically so the agent can work on them immediately.

Additionally, there is no mechanism to report system-level events (like clone success/failure) back to the backend for visibility in the frontend.

## Design

### 1. Model: `AgentSystemEvent`

New append-only model in `toony_agents` app for system-level events tied to an agent (not to a specific task).

```python
class AgentSystemEventType(models.TextChoices):
    REPO_CLONE_SUCCESS = "REPO_CLONE_SUCCESS"
    REPO_CLONE_ERROR = "REPO_CLONE_ERROR"
    CONFIG_SYNC_COMPLETED = "CONFIG_SYNC_COMPLETED"
    CONFIG_SYNC_FAILED = "CONFIG_SYNC_FAILED"

class AgentSystemEvent(BaseModel):
    toony_agent = models.ForeignKey(ToonyAgent, on_delete=models.CASCADE, related_name="system_events")
    event_type = models.CharField(max_length=50, choices=AgentSystemEventType.choices)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, null=True, blank=True)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, null=True, blank=True)
    data = models.JSONField(default=dict)
```

**`data` payloads by event type:**

- `REPO_CLONE_SUCCESS`: `{"repository_url": "...", "branch": "main", "clone_duration_ms": 3200}`
- `REPO_CLONE_ERROR`: `{"repository_url": "...", "error": "Authentication failed"}`
- `CONFIG_SYNC_COMPLETED`: `{"org_count": 2, "project_count": 5, "repos_cloned": 3, "repos_failed": 1}`
- `CONFIG_SYNC_FAILED`: `{"error": "..."}`

### 2. WebSocket Protocol Changes

**New message type: `repo.clone.result` (runner -> backend)**

Sent by the runner after each individual clone attempt:

```json
{
    "type": "repo.clone.result",
    "project_id": "uuid",
    "organization_id": "uuid",
    "status": "success",
    "repository_url": "https://github.com/org/repo.git",
    "branch": "main",
    "clone_duration_ms": 3200
}
```

Error case:

```json
{
    "type": "repo.clone.result",
    "project_id": "uuid",
    "organization_id": "uuid",
    "status": "error",
    "repository_url": "https://github.com/org/repo.git",
    "error": "Authentication failed: invalid token"
}
```

**Full flow on `config.sync`:**

1. Backend sends `config.sync` with orgs + projects
2. Runner creates folders for orgs and projects **without** `repository_url`
3. Runner identifies projects with `repository_url` that are not yet cloned (no `.git/` in expected path)
4. For each repo to clone, attempts `git clone` and sends `repo.clone.result` to backend
5. Backend receives each `repo.clone.result`, creates `AgentSystemEvent`, forwards to frontend
6. Runner sends `config.sync.ack` at the end (as it does today)

### 3. Backend: Consumer Handler and API

**`ToonyAgentRunnerConsumer` -- new handler in `receive_json`:**

```python
elif msg_type == "repo.clone.result":
    status = content.get("status")
    project_id = content.get("project_id")
    organization_id = content.get("organization_id")
    repository_url = content.get("repository_url", "")

    event_type = REPO_CLONE_SUCCESS if status == "success" else REPO_CLONE_ERROR
    data = {"repository_url": repository_url}

    if status == "success":
        data["branch"] = content.get("branch", "")
        data["clone_duration_ms"] = content.get("clone_duration_ms", 0)
    else:
        data["error"] = content.get("error", "")

    await _create_system_event(self.agent_id, event_type, organization_id, project_id, data)

    await self.channel_layer.group_send(
        self.frontend_group,
        {"type": "repo_clone_result", "data": content},
    )
```

**`ToonyAgentConsumer` -- new group handler:**

```python
async def repo_clone_result(self, event):
    await self.send_json({"type": "repo.clone.result", **event["data"]})
```

**REST API endpoint:**

```
GET /api/toony-agents/<agent_id>/system-events/
    ?event_type=REPO_CLONE_ERROR    (optional filter)
    ?project_id=<uuid>              (optional filter)
```

Uses `PaginatedViewMixin` with cursor pagination. Standard selector + output serializer pattern.

### 4. Runner: Workspace Changes and Cloning

**Change in `process_config_sync()` (`workspace.py`):**

Skip folder creation for projects with `repository_url`:

```python
for proj in org.get("projects", []):
    proj_dir = org_dir / "projects" / proj["slug"]

    if not proj.get("repository_url"):
        proj_dir.mkdir(parents=True, exist_ok=True)

    project_map[proj["id"]] = proj_dir
```

**New function `clone_pending_repos()`:**

```python
async def clone_pending_repos(project_map, config_data, conn):
    for org in config_data.get("organizations", []):
        for proj in org.get("projects", []):
            repo_url = proj.get("repository_url")
            if not repo_url:
                continue

            proj_dir = project_map[proj["id"]]
            if (proj_dir / ".git").exists():
                continue  # Already cloned

            start = time.monotonic()
            try:
                await async_git_clone(repo_url, proj_dir, branch=proj.get("base_branch", "main"))
                duration_ms = int((time.monotonic() - start) * 1000)
                await conn.send(repo_clone_result_msg(
                    project_id=proj["id"], organization_id=org["id"],
                    status="success", repository_url=repo_url,
                    branch=proj.get("base_branch", "main"),
                    clone_duration_ms=duration_ms,
                ))
            except Exception as exc:
                await conn.send(repo_clone_result_msg(
                    project_id=proj["id"], organization_id=org["id"],
                    status="error", repository_url=repo_url,
                    error=str(exc),
                ))
```

**Integration in `main.py`:**

After `process_config_sync()` and before `config.sync.ack`:

```python
elif isinstance(msg, ConfigSync):
    project_map = process_config_sync({"organizations": msg.organizations}, workspace_root)
    await clone_pending_repos(project_map, {"organizations": msg.organizations}, conn)
    await conn.send(ConfigSyncAckMessage(...).to_json())
```

**Clone detection:** Check for `.git/` directory in the project path.

**Authentication:** Out of scope. The runner relies on credentials already configured on the machine (SSH keys, git credential helpers, etc.). Authentication failures are reported as `REPO_CLONE_ERROR`.

## Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Event storage | New `AgentSystemEvent` model | Generic, extensible for future system events |
| Event granularity | One event per project | Enables per-repo debugging and individual status in frontend |
| Clone reporting | New `repo.clone.result` message type | Provides real-time progress; `config.sync.ack` sent at the end |
| Folder creation | Skip if `repository_url` present | Prevents `git clone` failure on existing directory |
| Clone detection | Check `.git/` existence | Simple, reliable |
| Git credentials | Machine-level (out of scope) | User configures SSH/tokens on the runner machine |
