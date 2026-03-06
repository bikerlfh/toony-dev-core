"""
Workspace provisioning from config.sync payloads.

Creates the local directory tree and workspace-registry.yaml files
that map backend organisations and projects to on-disk paths.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml


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
            proj_dir.mkdir(parents=True, exist_ok=True)

            project_map[proj["id"]] = proj_dir

            project_entries.append({
                "name": proj["name"],
                "id": proj["id"],
                "slug": proj_slug,
                "repo": proj.get("repo", ""),
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
