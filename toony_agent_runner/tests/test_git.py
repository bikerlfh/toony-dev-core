"""Tests for git commands."""

from __future__ import annotations

import asyncio
import subprocess
from pathlib import Path

import pytest

from toony_agent_runner.commands.git import git_clone


@pytest.fixture()
def local_repo(tmp_path: Path) -> Path:
    """Create a bare git repo to clone from."""
    repo = tmp_path / "origin.git"
    subprocess.run(["git", "init", "--bare", str(repo)], check=True, capture_output=True)
    work = tmp_path / "work_init"
    subprocess.run(["git", "clone", str(repo), str(work)], check=True, capture_output=True)
    (work / "README.md").write_text("hello")
    subprocess.run(["git", "-C", str(work), "add", "."], check=True, capture_output=True)
    subprocess.run(
        ["git", "-C", str(work), "commit", "-m", "init"],
        check=True,
        capture_output=True,
        env={
            "GIT_AUTHOR_NAME": "Test",
            "GIT_AUTHOR_EMAIL": "t@t",
            "GIT_COMMITTER_NAME": "Test",
            "GIT_COMMITTER_EMAIL": "t@t",
            "HOME": str(tmp_path),
            "PATH": "/usr/bin:/bin:/usr/local/bin",
        },
    )
    subprocess.run(["git", "-C", str(work), "push"], check=True, capture_output=True)
    return repo


def test_clones_repo(tmp_path: Path, local_repo: Path) -> None:
    work = tmp_path / "workspace"
    work.mkdir()
    result = asyncio.run(
        git_clone(
            {"repo_url": str(local_repo), "destination": "myrepo"},
            working_dir=work,
        )
    )
    assert result.success
    assert "Cloned:" in result.output
    assert "-> myrepo" in result.output
    assert (work / "myrepo" / "README.md").read_text() == "hello"


def test_default_destination(tmp_path: Path, local_repo: Path) -> None:
    work = tmp_path / "workspace"
    work.mkdir()
    result = asyncio.run(
        git_clone(
            {"repo_url": str(local_repo)},
            working_dir=work,
        )
    )
    assert result.success
    # Default directory name is derived from the repo name (origin)
    default_dir = work / "origin"
    assert default_dir.exists()
    assert (default_dir / "README.md").read_text() == "hello"


def test_invalid_repo(tmp_path: Path) -> None:
    result = asyncio.run(
        git_clone(
            {"repo_url": "https://invalid.example.com/no-such-repo.git"},
            working_dir=tmp_path,
        )
    )
    assert not result.success
    assert result.error


def test_missing_args(tmp_path: Path) -> None:
    result = asyncio.run(git_clone({}, working_dir=tmp_path))
    assert not result.success
    assert "Missing required arg: repo_url" in result.error
