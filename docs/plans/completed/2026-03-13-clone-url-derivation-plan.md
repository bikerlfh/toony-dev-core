# Clone URL Derivation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Derive git clone URLs (SSH or HTTPS) from browser repository URLs so the runner can clone repos without requiring users to enter clone-specific URLs.

**Architecture:** New pure function `build_clone_url()` in `workspace.py` parses browser URLs and builds clone URLs based on a configurable protocol (`ssh`/`https`). New `clone_protocol` field in `RunnerConfig` (default `ssh`). Threaded through `clone_pending_repos()` via `main.py`.

**Tech Stack:** Python stdlib (`urllib.parse`), runner config (`config.py`), pytest.

---

### Task 1: `build_clone_url()` function with tests

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/workspace.py`
- Modify: `toony_agent_runner/tests/test_workspace.py`

**Step 1: Write the failing tests**

Add to `toony_agent_runner/tests/test_workspace.py` after the existing imports:

```python
from toony_agent_runner.workspace import build_clone_url
```

Then add a new test class after `TestProcessConfigSyncRepoUrl`:

```python
class TestBuildCloneUrl:
    """Verify build_clone_url converts browser URLs to clone URLs."""

    # -- SSH protocol --

    def test_github_ssh(self):
        assert build_clone_url("https://github.com/owner/repo", "ssh") == "git@github.com:owner/repo.git"

    def test_gitlab_ssh(self):
        assert build_clone_url("https://gitlab.com/owner/repo", "ssh") == "git@gitlab.com:owner/repo.git"

    def test_bitbucket_ssh(self):
        assert build_clone_url("https://bitbucket.org/owner/repo", "ssh") == "git@bitbucket.org:owner/repo.git"

    # -- HTTPS protocol --

    def test_github_https(self):
        assert build_clone_url("https://github.com/owner/repo", "https") == "https://github.com/owner/repo.git"

    def test_gitlab_https(self):
        assert build_clone_url("https://gitlab.com/owner/repo", "https") == "https://gitlab.com/owner/repo.git"

    def test_bitbucket_https(self):
        assert build_clone_url("https://bitbucket.org/owner/repo", "https") == "https://bitbucket.org/owner/repo.git"

    # -- Edge cases --

    def test_trailing_slash_stripped(self):
        assert build_clone_url("https://github.com/owner/repo/", "ssh") == "git@github.com:owner/repo.git"

    def test_already_has_dot_git(self):
        assert build_clone_url("https://github.com/owner/repo.git", "ssh") == "git@github.com:owner/repo.git"

    def test_self_hosted_ssh(self):
        assert build_clone_url("https://git.mycompany.com/team/project", "ssh") == "git@git.mycompany.com:team/project.git"

    def test_self_hosted_https(self):
        assert build_clone_url("https://git.mycompany.com/team/project", "https") == "https://git.mycompany.com/team/project.git"

    def test_nested_path_gitlab(self):
        assert build_clone_url("https://gitlab.com/group/subgroup/repo", "ssh") == "git@gitlab.com:group/subgroup/repo.git"

    def test_default_protocol_is_ssh(self):
        assert build_clone_url("https://github.com/owner/repo") == "git@github.com:owner/repo.git"
```

**Step 2: Run tests to verify they fail**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_workspace.py::TestBuildCloneUrl -v`
Expected: FAIL (ImportError -- function does not exist)

**Step 3: Implement `build_clone_url()`**

Add to `toony_agent_runner/toony_agent_runner/workspace.py`, after the existing imports at the top, add:

```python
from urllib.parse import urlparse
```

Then add this function after the `logger` line (before `process_config_sync`):

```python
def build_clone_url(repository_url: str, protocol: str = "ssh") -> str:
    """Convert a browser repository URL to a git clone URL.

    Supports GitHub, GitLab, Bitbucket, and any generic git host.

    Args:
        repository_url: Browser URL (e.g. ``https://github.com/owner/repo``)
        protocol: ``"ssh"`` or ``"https"``

    Returns:
        Clone URL (e.g. ``git@github.com:owner/repo.git``)
    """
    parsed = urlparse(repository_url)
    host = parsed.hostname or ""
    path = parsed.path.strip("/")

    # Strip .git suffix if already present to normalize
    if path.endswith(".git"):
        path = path[:-4]

    if protocol == "ssh":
        return f"git@{host}:{path}.git"
    return f"https://{host}/{path}.git"
```

**Step 4: Run tests to verify they pass**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_workspace.py::TestBuildCloneUrl -v`
Expected: ALL PASS

**Step 5: Commit**

```
feat(runner): add build_clone_url function
```

---

### Task 2: Add `clone_protocol` to runner config

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/config.py`
- Modify: `toony_agent_runner/config.example.yml`

**Step 1: Add field to `RunnerConfig`**

In `config.py`, add `clone_protocol` field to the `RunnerConfig` dataclass (line 42-47):

Change from:
```python
@dataclass
class RunnerConfig:
    backend_url: str = "ws://localhost:8000/ws/toony-agents/runner/"
    api_key: str = ""
    workspace_root: str = ""
    claude: ClaudeConfig = field(default_factory=ClaudeConfig)
    reconnect: ReconnectConfig = field(default_factory=ReconnectConfig)
```

To:
```python
@dataclass
class RunnerConfig:
    backend_url: str = "ws://localhost:8000/ws/toony-agents/runner/"
    api_key: str = ""
    workspace_root: str = ""
    clone_protocol: str = "ssh"
    claude: ClaudeConfig = field(default_factory=ClaudeConfig)
    reconnect: ReconnectConfig = field(default_factory=ReconnectConfig)
```

**Step 2: Load from YAML in `load_config()`**

In the `load_config` function (line 63), add `clone_protocol` to the `RunnerConfig` constructor:

Change from:
```python
    return RunnerConfig(
        backend_url=raw.get("backend_url", RunnerConfig.backend_url),
        api_key=raw.get("api_key", ""),
        workspace_root=raw.get("workspace_root", ""),
```

To:
```python
    return RunnerConfig(
        backend_url=raw.get("backend_url", RunnerConfig.backend_url),
        api_key=raw.get("api_key", ""),
        workspace_root=raw.get("workspace_root", ""),
        clone_protocol=raw.get("clone_protocol", RunnerConfig.clone_protocol),
```

**Step 3: Persist in `save_config()`**

In the `save_config` function, after `data["workspace_root"]` block (around line 127), add:

```python
    data["clone_protocol"] = config.clone_protocol
```

**Step 4: Update `config.example.yml`**

Add after the `workspace_root` line (line 7):

```yaml
# Protocol for cloning repositories: ssh | https (default: ssh)
# ssh uses git@host:owner/repo.git, https uses https://host/owner/repo.git
clone_protocol: "ssh"
```

**Step 5: Commit**

```
feat(runner): add clone_protocol config setting
```

---

### Task 3: Wire `clone_protocol` through `clone_pending_repos` and `main.py`

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/workspace.py:110-160`
- Modify: `toony_agent_runner/toony_agent_runner/main.py:333`
- Modify: `toony_agent_runner/tests/test_workspace.py`

**Step 1: Update existing tests to verify clone URL conversion**

In `toony_agent_runner/tests/test_workspace.py`, update the `test_clones_repo_when_no_git_dir` test. The `fake_clone` receives the converted URL, so verify it:

Change the test from:
```python
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
```

To:
```python
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
                        repository_url="https://github.com/org/repo",
                        base_branch="main",
                    ),
                ]),
            ],
        }

        cloned_urls = []

        async def fake_clone(url, dest, branch):
            cloned_urls.append(url)
            dest.mkdir(parents=True, exist_ok=True)
            (dest / ".git").mkdir()

        monkeypatch.setattr("toony_agent_runner.workspace._async_git_clone", fake_clone)

        await clone_pending_repos(project_map, config_data, mock_conn, clone_protocol="ssh")

        assert cloned_urls == ["git@github.com:org/repo.git"]
        assert len(mock_conn.sent) == 1
        msg = mock_conn.sent[0]
        assert msg["type"] == "repo.clone.result"
        assert msg["status"] == "success"
        assert msg["project_id"] == "p-1"
```

Also update the other tests that call `clone_pending_repos` to pass `clone_protocol="ssh"`:
- `test_skips_already_cloned`: add `clone_protocol="ssh"` param
- `test_skips_projects_without_repository_url`: add `clone_protocol="ssh"` param
- `test_reports_error_on_clone_failure`: add `clone_protocol="ssh"` param

Add a new test for HTTPS protocol:

```python
    @pytest.mark.asyncio
    async def test_clones_with_https_protocol(self, tmp_path, mock_conn, monkeypatch):
        from toony_agent_runner.workspace import clone_pending_repos

        proj_dir = tmp_path / "acme" / "projects" / "my-repo"
        project_map = {"p-1": proj_dir}
        config_data = {
            "organizations": [
                _make_org(projects=[
                    _make_project(
                        slug="my-repo", project_id="p-1",
                        repository_url="https://github.com/org/repo",
                        base_branch="main",
                    ),
                ]),
            ],
        }

        cloned_urls = []

        async def fake_clone(url, dest, branch):
            cloned_urls.append(url)
            dest.mkdir(parents=True, exist_ok=True)
            (dest / ".git").mkdir()

        monkeypatch.setattr("toony_agent_runner.workspace._async_git_clone", fake_clone)

        await clone_pending_repos(project_map, config_data, mock_conn, clone_protocol="https")

        assert cloned_urls == ["https://github.com/org/repo.git"]
```

**Step 2: Run tests to verify they fail**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_workspace.py::TestClonePendingRepos -v`
Expected: FAIL (clone_pending_repos doesn't accept `clone_protocol` parameter)

**Step 3: Update `clone_pending_repos()` signature and body**

In `workspace.py`, change the function signature from:
```python
async def clone_pending_repos(
    project_map: dict[str, Path],
    config_data: dict[str, Any],
    conn,
) -> None:
```

To:
```python
async def clone_pending_repos(
    project_map: dict[str, Path],
    config_data: dict[str, Any],
    conn,
    *,
    clone_protocol: str = "ssh",
) -> None:
```

Then inside the function, after `repo_url = proj.get("repository_url")` (line 122) and the `if not repo_url: continue` check, add the URL conversion:

Change from:
```python
            branch = proj.get("base_branch", "main")
            start = time.monotonic()
            try:
                await _async_git_clone(repo_url, proj_dir, branch=branch)
```

To:
```python
            clone_url = build_clone_url(repo_url, clone_protocol)
            branch = proj.get("base_branch", "main")
            start = time.monotonic()
            try:
                await _async_git_clone(clone_url, proj_dir, branch=branch)
```

**Step 4: Update `main.py` to pass `clone_protocol`**

In `main.py` line 333, change from:
```python
                        await clone_pending_repos(project_map, config_payload, conn)
```

To:
```python
                        await clone_pending_repos(
                            project_map, config_payload, conn,
                            clone_protocol=config.clone_protocol,
                        )
```

**Step 5: Run all tests**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_workspace.py -v`
Expected: ALL PASS

**Step 6: Commit**

```
feat(runner): wire clone_protocol through clone_pending_repos
```

---

### Task 4: Update README.md

**Files:**
- Modify: `toony_agent_runner/README.md:118-135`

**Step 1: Add `clone_protocol` to the configuration table**

In the README configuration table (line 124), add a new row after `workspace_root`:

```
| `clone_protocol` | `ssh` | Protocol for cloning repositories: `ssh` or `https` |
```

**Step 2: Commit**

```
docs(runner): add clone_protocol to configuration table
```

---

### Task 5: Run full test suite

**Step 1: Run all runner tests**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/ -v`
Expected: ALL PASS

**Step 2: Final commit (if any fixes needed)**

```
chore: fix lint issues
```
