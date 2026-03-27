"""
Workspace provisioning from config.sync payloads.

Creates the local directory tree and workspace-registry.yaml files
that map backend organisations and projects to on-disk paths.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import yaml

from toony_agent_runner.protocol import RepoCloneResultMessage

logger = logging.getLogger(__name__)


# Directories to skip when collecting file tree
_DENYLIST_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv",
    "dist", "build", ".next", ".cache", "coverage",
    ".mypy_cache", ".pytest_cache", ".ruff_cache", ".tox",
    "egg-info", ".eggs", "target",
}

# File patterns to skip (exact names and extensions)
_DENYLIST_FILES = {
    ".DS_Store", "Thumbs.db", ".env", ".env.local", ".env.production",
    ".gitkeep", ".gitattributes", "__init__.py",
}

# Directory paths to skip (relative path segments that indicate migrations)
_DENYLIST_PATHS = {"migrations"}

_DENYLIST_EXTENSIONS = {
    ".pyc", ".pyo", ".pyd", ".so", ".dylib", ".dll",
    ".class", ".o", ".obj", ".a", ".lib",
    ".lock", ".log",
    ".swp", ".swo", ".swn",
    ".map",
}


def _is_denied_file(filename: str, extra_files: set[str] | None = None,
                    extra_extensions: set[str] | None = None) -> bool:
    """Check if a filename matches the file denylist."""
    denied_files = _DENYLIST_FILES | (extra_files or set())
    if filename in denied_files:
        return True
    denied_exts = _DENYLIST_EXTENSIONS | (extra_extensions or set())
    for ext in denied_exts:
        if filename.endswith(ext):
            return True
    return False


def collect_file_tree(project_dir: Path, *, extra_files: set[str] | None = None,
                      extra_extensions: set[str] | None = None,
                      extra_paths: set[str] | None = None) -> list[str]:
    """Walk *project_dir* and return a sorted list of relative file paths.

    Skips directories in the denylist (node_modules, .git, etc.)
    and files matching denied names or extensions.

    The ``extra_*`` params are merged with the hardcoded defaults,
    allowing user config to extend the denylist.
    """
    if not project_dir.is_dir():
        return []

    denied_dirs = _DENYLIST_DIRS
    denied_paths = _DENYLIST_PATHS | (extra_paths or set())

    paths: list[str] = []
    for item in sorted(project_dir.rglob("*")):
        # Skip denied directories and their contents
        parts = item.relative_to(project_dir).parts
        if any(p in denied_dirs or p in denied_paths for p in parts):
            continue
        if item.is_file() and not _is_denied_file(item.name, extra_files, extra_extensions):
            paths.append(str(item.relative_to(project_dir)))
    return paths


def collect_skills(project_dir: Path) -> list[dict[str, str]]:
    """Collect skill names and descriptions from project-level and user-level skill directories."""
    skills: list[dict[str, str]] = []

    # Project-level: {project_dir}/.claude/skills/*/
    project_skills_dir = project_dir / ".claude" / "skills"
    if project_skills_dir.is_dir():
        for skill_dir in sorted(project_skills_dir.iterdir()):
            if skill_dir.is_dir():
                info = _parse_skill_dir(skill_dir)
                if info:
                    skills.append(info)

    # User-level: ~/.claude/skills/*/
    user_skills_dir = Path.home() / ".claude" / "skills"
    if user_skills_dir.is_dir():
        for skill_dir in sorted(user_skills_dir.iterdir()):
            if skill_dir.is_dir():
                # Skip if already found at project level (project takes precedence)
                if any(s["name"] == skill_dir.name for s in skills):
                    continue
                info = _parse_skill_dir(skill_dir)
                if info:
                    skills.append(info)

    return skills


def _parse_skill_dir(skill_dir: Path) -> dict[str, str] | None:
    """Extract name and description from a skill directory.

    Looks for skill.md or the first .md file. Extracts the description
    from the first non-empty, non-heading, non-frontmatter line.
    """
    name = skill_dir.name

    # Find the skill file
    skill_file = skill_dir / "skill.md"
    if not skill_file.exists():
        # Try first .md file
        md_files = sorted(skill_dir.glob("*.md"))
        if not md_files:
            return None
        skill_file = md_files[0]

    try:
        content = skill_file.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return {"name": name, "description": ""}

    description = _extract_description(content)
    return {"name": name, "description": description}


def _extract_description(content: str) -> str:
    """Extract description from skill markdown content.

    Skips frontmatter (--- blocks), headings (#), and empty lines.
    Returns the first meaningful line, truncated to 120 chars.
    """
    in_frontmatter = False
    for line in content.splitlines():
        stripped = line.strip()
        if stripped == "---":
            in_frontmatter = not in_frontmatter
            continue
        if in_frontmatter:
            continue
        if not stripped or stripped.startswith("#"):
            continue
        # Found first content line
        if len(stripped) > 120:
            return stripped[:117] + "..."
        return stripped
    return ""


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


def process_config_sync(
    data: dict[str, Any],
    workspace_root: Path,
) -> dict[str, Path]:
    """Provision the local workspace from a ``config.sync`` payload.

    For each organisation in *data["organizations"]* the function:

    1. Creates ``{workspace_root}/{org_slug}/.toony/``
    2. Creates ``{workspace_root}/{org_slug}/projects/{project_slug}/`` for
       every project
    3. Writes ``workspace-registry.yaml`` inside the ``.toony`` directory

    Returns a mapping of ``project_id -> Path`` for every project across all
    organisations.
    """
    project_map: dict[str, Path] = {}

    for org in data.get("organizations", []):
        org_slug: str = org["slug"]
        org_dir = workspace_root / org_slug
        toony_dir = org_dir / ".toony"
        toony_dir.mkdir(parents=True, exist_ok=True)

        # Build per-project entries and create directories
        project_entries: list[dict[str, Any]] = []
        for proj in org.get("projects", []):
            proj_slug: str = proj["slug"]
            proj_dir = org_dir / "projects" / proj_slug

            if not proj.get("repository_url"):
                proj_dir.mkdir(parents=True, exist_ok=True)

            project_map[proj["id"]] = proj_dir

            project_entries.append({
                "name": proj["name"],
                "id": proj["id"],
                "slug": proj_slug,
                "repo": proj.get("repo", ""),
                "repository_url": proj.get("repository_url", ""),
                "base_branch": proj.get("base_branch", "main"),
                "branch_convention": proj.get("branch_convention", ""),
                "default_reviewers": proj.get("default_reviewers", []),
                "issue_prefix": proj.get("issue_prefix", ""),
            })

        # Assemble registry content
        registry_data: dict[str, Any] = {
            "organization": org["name"],
            "organization_id": org["id"],
            "integrations": org.get("integrations", {}),
            "defaults": org.get("defaults", {}),
            "projects": project_entries,
        }

        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        header = (
            f"# MANAGED BY TOONY -- DO NOT EDIT\n"
            f"# Last synced: {timestamp}\n"
        )
        yaml_body = yaml.dump(
            registry_data,
            default_flow_style=False,
            sort_keys=False,
        )

        registry_path = toony_dir / "workspace-registry.yaml"
        registry_path.write_text(header + yaml_body)

    return project_map


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
    *,
    clone_protocol: str = "ssh",
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

            clone_url = build_clone_url(repo_url, clone_protocol)
            branch = proj.get("base_branch", "main")
            start = time.monotonic()
            try:
                await _async_git_clone(clone_url, proj_dir, branch=branch)
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


def resolve_project_path(
    project_id: str | None,
    project_map: dict[str, Path],
) -> Path | None:
    """Look up *project_id* in *project_map*.

    Returns ``None`` when *project_id* is ``None`` or not found.
    """
    if project_id is None:
        return None
    return project_map.get(project_id)
