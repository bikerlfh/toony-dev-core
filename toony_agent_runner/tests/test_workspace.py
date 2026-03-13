"""Tests for workspace config sync provisioning."""

from __future__ import annotations

from pathlib import Path

import yaml
import pytest

from toony_agent_runner.workspace import process_config_sync, resolve_project_path


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_org(
    *,
    slug: str = "acme-corp",
    name: str = "Acme Corp",
    org_id: str = "org-1",
    integrations: dict | None = None,
    defaults: dict | None = None,
    projects: list | None = None,
) -> dict:
    return {
        "slug": slug,
        "name": name,
        "id": org_id,
        "integrations": integrations or {"pm": "linear", "git": "github"},
        "defaults": defaults or {
            "base_branch": "main",
            "branch_convention": "feat/{issue_prefix}-{issue_number}-{slug}",
            "default_reviewers": [],
        },
        "projects": projects if projects is not None else [],
    }


def _make_project(
    *,
    slug: str = "backend-api",
    name: str = "Backend API",
    project_id: str = "proj-1",
    repo: str = "acme/backend-api",
    base_branch: str = "main",
    branch_convention: str = "feat/{issue_prefix}-{issue_number}-{slug}",
    default_reviewers: list | None = None,
    issue_prefix: str = "ENG",
    repository_url: str = "",
) -> dict:
    return {
        "slug": slug,
        "name": name,
        "id": project_id,
        "repo": repo,
        "base_branch": base_branch,
        "branch_convention": branch_convention,
        "default_reviewers": default_reviewers or [],
        "issue_prefix": issue_prefix,
        "repository_url": repository_url,
    }


# ---------------------------------------------------------------------------
# process_config_sync tests
# ---------------------------------------------------------------------------

class TestProcessConfigSyncDirectoryCreation:
    """Verify that process_config_sync creates the expected directory tree."""

    def test_creates_org_directory(self, tmp_path: Path):
        data = {"organizations": [_make_org()]}
        process_config_sync(data, tmp_path)

        org_dir = tmp_path / "acme-corp"
        assert org_dir.is_dir()

    def test_creates_toony_meta_directory(self, tmp_path: Path):
        data = {"organizations": [_make_org()]}
        process_config_sync(data, tmp_path)

        toony_dir = tmp_path / "acme-corp" / ".toony"
        assert toony_dir.is_dir()

    def test_creates_project_directories(self, tmp_path: Path):
        projects = [
            _make_project(slug="backend-api", project_id="p-1"),
            _make_project(slug="frontend-app", name="Frontend App", project_id="p-2"),
        ]
        data = {"organizations": [_make_org(projects=projects)]}
        process_config_sync(data, tmp_path)

        assert (tmp_path / "acme-corp" / "projects" / "backend-api").is_dir()
        assert (tmp_path / "acme-corp" / "projects" / "frontend-app").is_dir()


class TestProcessConfigSyncRegistryFile:
    """Verify that workspace-registry.yaml is written correctly."""

    def test_writes_workspace_registry(self, tmp_path: Path):
        data = {"organizations": [_make_org()]}
        process_config_sync(data, tmp_path)

        registry_path = tmp_path / "acme-corp" / ".toony" / "workspace-registry.yaml"
        assert registry_path.is_file()

    def test_registry_has_managed_header(self, tmp_path: Path):
        data = {"organizations": [_make_org()]}
        process_config_sync(data, tmp_path)

        registry_path = tmp_path / "acme-corp" / ".toony" / "workspace-registry.yaml"
        content = registry_path.read_text()
        assert content.startswith("# MANAGED BY TOONY -- DO NOT EDIT")

    def test_registry_is_valid_yaml(self, tmp_path: Path):
        projects = [_make_project()]
        data = {"organizations": [_make_org(projects=projects)]}
        process_config_sync(data, tmp_path)

        registry_path = tmp_path / "acme-corp" / ".toony" / "workspace-registry.yaml"
        content = registry_path.read_text()
        # Strip the header comment lines before parsing
        yaml_lines = [
            line for line in content.splitlines()
            if not line.startswith("#")
        ]
        parsed = yaml.safe_load("\n".join(yaml_lines))
        assert parsed is not None

    def test_registry_contains_org_fields(self, tmp_path: Path):
        projects = [_make_project()]
        org = _make_org(
            name="Acme Corp",
            org_id="org-1",
            integrations={"pm": "linear", "git": "github"},
            defaults={"base_branch": "main", "branch_convention": "feat/{slug}",
                       "default_reviewers": ["alice"]},
            projects=projects,
        )
        data = {"organizations": [org]}
        process_config_sync(data, tmp_path)

        registry_path = tmp_path / "acme-corp" / ".toony" / "workspace-registry.yaml"
        content = registry_path.read_text()
        yaml_lines = [
            line for line in content.splitlines()
            if not line.startswith("#")
        ]
        parsed = yaml.safe_load("\n".join(yaml_lines))

        assert parsed["organization"] == "Acme Corp"
        assert parsed["organization_id"] == "org-1"
        assert parsed["integrations"] == {"pm": "linear", "git": "github"}
        assert parsed["defaults"]["base_branch"] == "main"
        assert parsed["defaults"]["default_reviewers"] == ["alice"]

    def test_registry_contains_project_details(self, tmp_path: Path):
        project = _make_project(
            slug="backend-api",
            name="Backend API",
            project_id="proj-1",
            repo="acme/backend-api",
            base_branch="develop",
            branch_convention="feat/ENG-{issue_number}-{slug}",
            default_reviewers=["bob"],
            issue_prefix="ENG",
        )
        data = {"organizations": [_make_org(projects=[project])]}
        process_config_sync(data, tmp_path)

        registry_path = tmp_path / "acme-corp" / ".toony" / "workspace-registry.yaml"
        content = registry_path.read_text()
        yaml_lines = [
            line for line in content.splitlines()
            if not line.startswith("#")
        ]
        parsed = yaml.safe_load("\n".join(yaml_lines))

        assert len(parsed["projects"]) == 1
        proj = parsed["projects"][0]
        assert proj["name"] == "Backend API"
        assert proj["id"] == "proj-1"
        assert proj["slug"] == "backend-api"
        assert proj["repo"] == "acme/backend-api"
        assert proj["base_branch"] == "develop"
        assert proj["branch_convention"] == "feat/ENG-{issue_number}-{slug}"
        assert proj["default_reviewers"] == ["bob"]
        assert proj["issue_prefix"] == "ENG"


class TestProcessConfigSyncProjectMap:
    """Verify the returned project_id -> Path mapping."""

    def test_returns_correct_project_map(self, tmp_path: Path):
        projects = [
            _make_project(slug="backend-api", project_id="p-1"),
            _make_project(slug="frontend-app", project_id="p-2"),
        ]
        data = {"organizations": [_make_org(projects=projects)]}
        result = process_config_sync(data, tmp_path)

        assert result["p-1"] == tmp_path / "acme-corp" / "projects" / "backend-api"
        assert result["p-2"] == tmp_path / "acme-corp" / "projects" / "frontend-app"

    def test_empty_organizations_returns_empty_dict(self, tmp_path: Path):
        data = {"organizations": []}
        result = process_config_sync(data, tmp_path)
        assert result == {}

    def test_org_with_no_projects_returns_empty_dict(self, tmp_path: Path):
        data = {"organizations": [_make_org(projects=[])]}
        result = process_config_sync(data, tmp_path)
        assert result == {}


class TestProcessConfigSyncOverwrite:
    """Verify full overwrite on re-sync."""

    def test_overwrite_on_resync_changed_name(self, tmp_path: Path):
        # First sync
        data1 = {"organizations": [_make_org(name="Acme Corp Old")]}
        process_config_sync(data1, tmp_path)

        # Second sync with changed name
        data2 = {"organizations": [_make_org(name="Acme Corp New")]}
        process_config_sync(data2, tmp_path)

        registry_path = tmp_path / "acme-corp" / ".toony" / "workspace-registry.yaml"
        content = registry_path.read_text()
        yaml_lines = [
            line for line in content.splitlines()
            if not line.startswith("#")
        ]
        parsed = yaml.safe_load("\n".join(yaml_lines))
        assert parsed["organization"] == "Acme Corp New"

    def test_overwrite_on_resync_empty_projects(self, tmp_path: Path):
        # First sync with projects
        projects = [_make_project(slug="old-proj", project_id="p-old")]
        data1 = {"organizations": [_make_org(projects=projects)]}
        process_config_sync(data1, tmp_path)

        # Second sync with no projects
        data2 = {"organizations": [_make_org(projects=[])]}
        process_config_sync(data2, tmp_path)

        registry_path = tmp_path / "acme-corp" / ".toony" / "workspace-registry.yaml"
        content = registry_path.read_text()
        yaml_lines = [
            line for line in content.splitlines()
            if not line.startswith("#")
        ]
        parsed = yaml.safe_load("\n".join(yaml_lines))
        assert parsed["projects"] == []

    def test_does_not_touch_existing_local_yaml(self, tmp_path: Path):
        data = {"organizations": [_make_org()]}

        # Pre-create a local.yaml that the user may have customised
        org_toony = tmp_path / "acme-corp" / ".toony"
        org_toony.mkdir(parents=True)
        local_yaml = org_toony / "local.yaml"
        local_yaml.write_text("custom_setting: true\n")

        process_config_sync(data, tmp_path)

        assert local_yaml.read_text() == "custom_setting: true\n"


class TestProcessConfigSyncMultipleOrgs:
    """Verify handling of multiple organisations in one sync."""

    def test_multiple_organizations(self, tmp_path: Path):
        org1 = _make_org(slug="acme", name="Acme", org_id="o-1", projects=[
            _make_project(slug="api", project_id="p-1"),
        ])
        org2 = _make_org(slug="widgets", name="Widgets Inc", org_id="o-2", projects=[
            _make_project(slug="dashboard", project_id="p-2"),
        ])
        data = {"organizations": [org1, org2]}
        result = process_config_sync(data, tmp_path)

        # Directories created for both orgs
        assert (tmp_path / "acme" / ".toony" / "workspace-registry.yaml").is_file()
        assert (tmp_path / "widgets" / ".toony" / "workspace-registry.yaml").is_file()
        assert (tmp_path / "acme" / "projects" / "api").is_dir()
        assert (tmp_path / "widgets" / "projects" / "dashboard").is_dir()

        # Project map contains entries from both orgs
        assert result["p-1"] == tmp_path / "acme" / "projects" / "api"
        assert result["p-2"] == tmp_path / "widgets" / "projects" / "dashboard"


class TestProcessConfigSyncIdempotent:
    """Running process_config_sync twice with the same data should not error."""

    def test_idempotent(self, tmp_path: Path):
        projects = [_make_project()]
        data = {"organizations": [_make_org(projects=projects)]}

        result1 = process_config_sync(data, tmp_path)
        result2 = process_config_sync(data, tmp_path)

        assert result1 == result2
        assert (tmp_path / "acme-corp" / ".toony" / "workspace-registry.yaml").is_file()


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


# ---------------------------------------------------------------------------
# resolve_project_path tests
# ---------------------------------------------------------------------------

class TestResolveProjectPath:
    def test_known_project(self, tmp_path: Path):
        project_map = {"p-1": tmp_path / "org" / "projects" / "api"}
        assert resolve_project_path("p-1", project_map) == tmp_path / "org" / "projects" / "api"

    def test_unknown_project(self, tmp_path: Path):
        project_map = {"p-1": tmp_path / "org" / "projects" / "api"}
        assert resolve_project_path("p-unknown", project_map) is None

    def test_none_project_id(self, tmp_path: Path):
        project_map = {"p-1": tmp_path / "org" / "projects" / "api"}
        assert resolve_project_path(None, project_map) is None


# ---------------------------------------------------------------------------
# clone_pending_repos tests
# ---------------------------------------------------------------------------

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
