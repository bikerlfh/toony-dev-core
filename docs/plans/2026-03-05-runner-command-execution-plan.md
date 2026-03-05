# Runner Command Execution — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a command execution channel to the toony_agent_runner so the backend can send direct filesystem/system commands independently of Claude tasks.

**Architecture:** New `commands/` package with a static registry mapping command keys to async handler functions. Protocol extended with `command.execute` (incoming) and `command.result` (outgoing). Commands dispatch as independent `asyncio.create_task()` calls in the main loop — parallel to Claude tasks.

**Tech Stack:** Python 3.11+ asyncio, pathlib, shutil, urllib (stdlib). No new dependencies.

**Design doc:** `docs/plans/2026-03-05-runner-command-execution-design.md`

---

### Task 1: Registry core — `CommandResult`, `resolve_safe_path`, `execute_command`

**Files:**
- Create: `toony_agent_runner/toony_agent_runner/commands/__init__.py`
- Create: `toony_agent_runner/toony_agent_runner/commands/registry.py`
- Create: `toony_agent_runner/tests/__init__.py`
- Create: `toony_agent_runner/tests/test_registry.py`

**Step 1: Write the failing tests**

```python
# tests/test_registry.py
"""Tests for the command registry core."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from toony_agent_runner.commands.registry import (
    CommandResult,
    resolve_safe_path,
    execute_command,
    COMMAND_REGISTRY,
)


class TestCommandResult:
    def test_success_result(self):
        r = CommandResult(success=True, output="done")
        assert r.success is True
        assert r.output == "done"
        assert r.error == ""

    def test_failure_result(self):
        r = CommandResult(success=False, error="boom")
        assert r.success is False
        assert r.error == "boom"


class TestResolveSafePath:
    def test_relative_path(self, tmp_path: Path):
        result = resolve_safe_path(tmp_path, "subdir/file.txt")
        assert result == tmp_path / "subdir" / "file.txt"

    def test_traversal_blocked(self, tmp_path: Path):
        with pytest.raises(ValueError, match="escapes sandbox"):
            resolve_safe_path(tmp_path, "../../etc/passwd")

    def test_absolute_path_outside_blocked(self, tmp_path: Path):
        with pytest.raises(ValueError, match="escapes sandbox"):
            resolve_safe_path(tmp_path, "/etc/passwd")

    def test_dot_path_resolves_to_base(self, tmp_path: Path):
        result = resolve_safe_path(tmp_path, ".")
        assert result == tmp_path


class TestExecuteCommand:
    def test_unknown_command(self, tmp_path: Path):
        result = asyncio.run(execute_command("nope", {}, tmp_path))
        assert result.success is False
        assert "Unknown command" in result.error

    def test_registry_is_not_empty(self):
        assert len(COMMAND_REGISTRY) > 0
```

**Step 2: Run tests to verify they fail**

Run: `cd toony_agent_runner && python -m pytest tests/test_registry.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'toony_agent_runner.commands'`

**Step 3: Write minimal implementation**

```python
# toony_agent_runner/commands/__init__.py
from .registry import CommandResult, execute_command, COMMAND_REGISTRY

__all__ = ["CommandResult", "execute_command", "COMMAND_REGISTRY"]
```

```python
# toony_agent_runner/commands/registry.py
"""Command registry core: result type, sandboxing, dispatch."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class CommandResult:
    success: bool
    output: str = ""
    error: str = ""


CommandHandler = Callable[[dict[str, Any], Path], Awaitable[CommandResult]]


def resolve_safe_path(working_dir: Path, relative_path: str) -> Path:
    """Resolve a relative path inside working_dir.

    Raises ValueError if the resolved path escapes the sandbox.
    """
    resolved = (working_dir / relative_path).resolve()
    if not resolved.is_relative_to(working_dir.resolve()):
        raise ValueError(f"Path escapes sandbox: {relative_path}")
    return resolved


# Registry will be populated as command modules are implemented.
# Imported here to avoid circular imports — modules register at bottom of this file.
COMMAND_REGISTRY: dict[str, CommandHandler] = {}


async def execute_command(
    key: str, args: dict[str, Any], working_dir: Path
) -> CommandResult:
    """Look up and execute a command by key."""
    handler = COMMAND_REGISTRY.get(key)
    if handler is None:
        return CommandResult(success=False, error=f"Unknown command: {key}")
    try:
        return await handler(args, working_dir)
    except Exception as exc:
        return CommandResult(success=False, error=str(exc))
```

```python
# tests/__init__.py
```

**Step 4: Run tests to verify they pass**

Run: `cd toony_agent_runner && python -m pytest tests/test_registry.py -v`
Expected: All PASS (6 tests). `test_registry_is_not_empty` will FAIL since registry is empty — that's fine, it will pass after Task 2. Mark it `@pytest.mark.skip(reason="registry populated in Task 2")` for now.

**Step 5: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/commands/ toony_agent_runner/tests/
git commit -m "feat(runner): add command registry core — CommandResult, resolve_safe_path, execute_command"
```

---

### Task 2: Filesystem commands

**Files:**
- Create: `toony_agent_runner/toony_agent_runner/commands/filesystem.py`
- Modify: `toony_agent_runner/toony_agent_runner/commands/registry.py` (populate COMMAND_REGISTRY)
- Create: `toony_agent_runner/tests/test_filesystem.py`

**Step 1: Write the failing tests**

```python
# tests/test_filesystem.py
"""Tests for filesystem commands."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from toony_agent_runner.commands.filesystem import (
    create_dir,
    create_file,
    move_file,
    rename_file,
    copy_file,
)


class TestCreateDir:
    def test_creates_directory(self, tmp_path: Path):
        result = asyncio.run(create_dir({"path": "newdir"}, tmp_path))
        assert result.success is True
        assert (tmp_path / "newdir").is_dir()

    def test_creates_nested_dirs(self, tmp_path: Path):
        result = asyncio.run(create_dir({"path": "a/b/c"}, tmp_path))
        assert result.success is True
        assert (tmp_path / "a" / "b" / "c").is_dir()

    def test_existing_dir_ok(self, tmp_path: Path):
        (tmp_path / "existing").mkdir()
        result = asyncio.run(create_dir({"path": "existing"}, tmp_path))
        assert result.success is True

    def test_traversal_blocked(self, tmp_path: Path):
        result = asyncio.run(create_dir({"path": "../../escape"}, tmp_path))
        assert result.success is False
        assert "escapes sandbox" in result.error

    def test_missing_path_arg(self, tmp_path: Path):
        result = asyncio.run(create_dir({}, tmp_path))
        assert result.success is False


class TestCreateFile:
    def test_creates_empty_file(self, tmp_path: Path):
        result = asyncio.run(create_file({"path": "empty.txt"}, tmp_path))
        assert result.success is True
        f = tmp_path / "empty.txt"
        assert f.exists()
        assert f.read_text() == ""

    def test_creates_file_with_content(self, tmp_path: Path):
        result = asyncio.run(
            create_file({"path": "hello.py", "content": "print('hi')"}, tmp_path)
        )
        assert result.success is True
        assert (tmp_path / "hello.py").read_text() == "print('hi')"

    def test_creates_parent_dirs(self, tmp_path: Path):
        result = asyncio.run(
            create_file({"path": "sub/dir/file.txt", "content": "x"}, tmp_path)
        )
        assert result.success is True
        assert (tmp_path / "sub" / "dir" / "file.txt").read_text() == "x"

    def test_missing_path_arg(self, tmp_path: Path):
        result = asyncio.run(create_file({}, tmp_path))
        assert result.success is False


class TestMoveFile:
    def test_moves_file(self, tmp_path: Path):
        (tmp_path / "src.txt").write_text("data")
        result = asyncio.run(
            move_file({"source": "src.txt", "destination": "dst.txt"}, tmp_path)
        )
        assert result.success is True
        assert not (tmp_path / "src.txt").exists()
        assert (tmp_path / "dst.txt").read_text() == "data"

    def test_moves_to_subdir(self, tmp_path: Path):
        (tmp_path / "src.txt").write_text("data")
        (tmp_path / "sub").mkdir()
        result = asyncio.run(
            move_file({"source": "src.txt", "destination": "sub/src.txt"}, tmp_path)
        )
        assert result.success is True
        assert (tmp_path / "sub" / "src.txt").read_text() == "data"

    def test_source_not_found(self, tmp_path: Path):
        result = asyncio.run(
            move_file({"source": "nope.txt", "destination": "dst.txt"}, tmp_path)
        )
        assert result.success is False

    def test_missing_args(self, tmp_path: Path):
        result = asyncio.run(move_file({}, tmp_path))
        assert result.success is False


class TestRenameFile:
    def test_renames_file(self, tmp_path: Path):
        (tmp_path / "old.txt").write_text("data")
        result = asyncio.run(
            rename_file({"path": "old.txt", "new_name": "new.txt"}, tmp_path)
        )
        assert result.success is True
        assert not (tmp_path / "old.txt").exists()
        assert (tmp_path / "new.txt").read_text() == "data"

    def test_rename_in_subdir(self, tmp_path: Path):
        sub = tmp_path / "sub"
        sub.mkdir()
        (sub / "old.txt").write_text("data")
        result = asyncio.run(
            rename_file({"path": "sub/old.txt", "new_name": "new.txt"}, tmp_path)
        )
        assert result.success is True
        assert (sub / "new.txt").read_text() == "data"

    def test_missing_args(self, tmp_path: Path):
        result = asyncio.run(rename_file({}, tmp_path))
        assert result.success is False


class TestCopyFile:
    def test_copies_file(self, tmp_path: Path):
        (tmp_path / "src.txt").write_text("data")
        result = asyncio.run(
            copy_file({"source": "src.txt", "destination": "dst.txt"}, tmp_path)
        )
        assert result.success is True
        assert (tmp_path / "src.txt").read_text() == "data"
        assert (tmp_path / "dst.txt").read_text() == "data"

    def test_copies_directory(self, tmp_path: Path):
        src = tmp_path / "mydir"
        src.mkdir()
        (src / "file.txt").write_text("inside")
        result = asyncio.run(
            copy_file({"source": "mydir", "destination": "mydir_copy"}, tmp_path)
        )
        assert result.success is True
        assert (tmp_path / "mydir_copy" / "file.txt").read_text() == "inside"

    def test_missing_args(self, tmp_path: Path):
        result = asyncio.run(copy_file({}, tmp_path))
        assert result.success is False
```

**Step 2: Run tests to verify they fail**

Run: `cd toony_agent_runner && python -m pytest tests/test_filesystem.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'toony_agent_runner.commands.filesystem'`

**Step 3: Write implementation**

```python
# toony_agent_runner/commands/filesystem.py
"""Filesystem commands: create, move, rename, copy."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from .registry import CommandResult, resolve_safe_path


async def create_dir(args: dict[str, Any], working_dir: Path) -> CommandResult:
    path_str = args.get("path")
    if not path_str:
        return CommandResult(success=False, error="Missing required arg: path")
    try:
        target = resolve_safe_path(working_dir, path_str)
    except ValueError as exc:
        return CommandResult(success=False, error=str(exc))
    target.mkdir(parents=True, exist_ok=True)
    return CommandResult(success=True, output=f"Directory created: {path_str}")


async def create_file(args: dict[str, Any], working_dir: Path) -> CommandResult:
    path_str = args.get("path")
    if not path_str:
        return CommandResult(success=False, error="Missing required arg: path")
    try:
        target = resolve_safe_path(working_dir, path_str)
    except ValueError as exc:
        return CommandResult(success=False, error=str(exc))
    target.parent.mkdir(parents=True, exist_ok=True)
    content = args.get("content", "")
    target.write_text(content)
    return CommandResult(success=True, output=f"File created: {path_str}")


async def move_file(args: dict[str, Any], working_dir: Path) -> CommandResult:
    source_str = args.get("source")
    dest_str = args.get("destination")
    if not source_str or not dest_str:
        return CommandResult(success=False, error="Missing required args: source, destination")
    try:
        source = resolve_safe_path(working_dir, source_str)
        dest = resolve_safe_path(working_dir, dest_str)
    except ValueError as exc:
        return CommandResult(success=False, error=str(exc))
    if not source.exists():
        return CommandResult(success=False, error=f"Source not found: {source_str}")
    shutil.move(str(source), str(dest))
    return CommandResult(success=True, output=f"Moved: {source_str} -> {dest_str}")


async def rename_file(args: dict[str, Any], working_dir: Path) -> CommandResult:
    path_str = args.get("path")
    new_name = args.get("new_name")
    if not path_str or not new_name:
        return CommandResult(success=False, error="Missing required args: path, new_name")
    try:
        source = resolve_safe_path(working_dir, path_str)
    except ValueError as exc:
        return CommandResult(success=False, error=str(exc))
    if not source.exists():
        return CommandResult(success=False, error=f"Source not found: {path_str}")
    dest = source.parent / new_name
    if not dest.resolve().is_relative_to(working_dir.resolve()):
        return CommandResult(success=False, error=f"New name escapes sandbox: {new_name}")
    source.rename(dest)
    return CommandResult(success=True, output=f"Renamed: {path_str} -> {new_name}")


async def copy_file(args: dict[str, Any], working_dir: Path) -> CommandResult:
    source_str = args.get("source")
    dest_str = args.get("destination")
    if not source_str or not dest_str:
        return CommandResult(success=False, error="Missing required args: source, destination")
    try:
        source = resolve_safe_path(working_dir, source_str)
        dest = resolve_safe_path(working_dir, dest_str)
    except ValueError as exc:
        return CommandResult(success=False, error=str(exc))
    if not source.exists():
        return CommandResult(success=False, error=f"Source not found: {source_str}")
    if source.is_dir():
        shutil.copytree(str(source), str(dest))
    else:
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(str(source), str(dest))
    return CommandResult(success=True, output=f"Copied: {source_str} -> {dest_str}")
```

Then update `registry.py` — add at the bottom, after `execute_command`:

```python
# -- Populate registry --
from .filesystem import create_dir, create_file, move_file, rename_file, copy_file

COMMAND_REGISTRY.update({
    "create_dir": create_dir,
    "create_file": create_file,
    "move_file": move_file,
    "rename_file": rename_file,
    "copy_file": copy_file,
})
```

Also remove the `@pytest.mark.skip` from `test_registry_is_not_empty` in `tests/test_registry.py`.

**Step 4: Run tests to verify they pass**

Run: `cd toony_agent_runner && python -m pytest tests/test_filesystem.py tests/test_registry.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/commands/filesystem.py toony_agent_runner/toony_agent_runner/commands/registry.py toony_agent_runner/tests/
git commit -m "feat(runner): add filesystem commands — create_dir, create_file, move_file, rename_file, copy_file"
```

---

### Task 3: Download commands

**Files:**
- Create: `toony_agent_runner/toony_agent_runner/commands/download.py`
- Modify: `toony_agent_runner/toony_agent_runner/commands/registry.py` (add to COMMAND_REGISTRY)
- Create: `toony_agent_runner/tests/test_download.py`

**Step 1: Write the failing tests**

```python
# tests/test_download.py
"""Tests for download commands."""

from __future__ import annotations

import asyncio
import http.server
import threading
from pathlib import Path

import pytest

from toony_agent_runner.commands.download import download_url, download_backend


class TestDownloadUrl:
    """Test download_url using a local HTTP server."""

    @pytest.fixture(autouse=True)
    def _serve(self, tmp_path: Path):
        """Start a throwaway HTTP server serving a test file."""
        serve_dir = tmp_path / "serve"
        serve_dir.mkdir()
        (serve_dir / "test.txt").write_text("hello from server")

        handler = lambda *a, **kw: http.server.SimpleHTTPRequestHandler(
            *a, directory=str(serve_dir), **kw
        )
        self.server = http.server.HTTPServer(("127.0.0.1", 0), handler)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        yield
        self.server.shutdown()

    def test_downloads_file(self, tmp_path: Path):
        work = tmp_path / "work"
        work.mkdir()
        url = f"http://127.0.0.1:{self.port}/test.txt"
        result = asyncio.run(download_url({"url": url, "destination": "out.txt"}, work))
        assert result.success is True
        assert (work / "out.txt").read_text() == "hello from server"

    def test_creates_parent_dirs(self, tmp_path: Path):
        work = tmp_path / "work"
        work.mkdir()
        url = f"http://127.0.0.1:{self.port}/test.txt"
        result = asyncio.run(
            download_url({"url": url, "destination": "sub/dir/out.txt"}, work)
        )
        assert result.success is True
        assert (work / "sub" / "dir" / "out.txt").exists()

    def test_missing_args(self, tmp_path: Path):
        result = asyncio.run(download_url({}, tmp_path))
        assert result.success is False

    def test_bad_url(self, tmp_path: Path):
        work = tmp_path / "work"
        work.mkdir()
        result = asyncio.run(
            download_url(
                {"url": "http://127.0.0.1:1/nope", "destination": "out.txt"}, work
            )
        )
        assert result.success is False


class TestDownloadBackend:
    """Test download_backend using a local HTTP server with auth check."""

    @pytest.fixture(autouse=True)
    def _serve(self, tmp_path: Path):
        serve_dir = tmp_path / "serve"
        serve_dir.mkdir()
        (serve_dir / "asset.bin").write_bytes(b"binary data")

        class AuthHandler(http.server.SimpleHTTPRequestHandler):
            def __init__(self, *a, **kw):
                super().__init__(*a, directory=str(serve_dir), **kw)

            def do_GET(self):
                auth = self.headers.get("Authorization", "")
                if auth != "Bearer tok_ta_test":
                    self.send_error(401)
                    return
                super().do_GET()

        self.server = http.server.HTTPServer(("127.0.0.1", 0), AuthHandler)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        yield
        self.server.shutdown()

    def test_downloads_with_auth(self, tmp_path: Path):
        work = tmp_path / "work"
        work.mkdir()
        url = f"http://127.0.0.1:{self.port}/asset.bin"
        result = asyncio.run(
            download_backend(
                {
                    "download_url": url,
                    "destination": "asset.bin",
                    "api_key": "tok_ta_test",
                },
                work,
            )
        )
        assert result.success is True
        assert (work / "asset.bin").read_bytes() == b"binary data"

    def test_auth_failure(self, tmp_path: Path):
        work = tmp_path / "work"
        work.mkdir()
        url = f"http://127.0.0.1:{self.port}/asset.bin"
        result = asyncio.run(
            download_backend(
                {
                    "download_url": url,
                    "destination": "asset.bin",
                    "api_key": "wrong_key",
                },
                work,
            )
        )
        assert result.success is False

    def test_missing_args(self, tmp_path: Path):
        result = asyncio.run(download_backend({}, tmp_path))
        assert result.success is False
```

**Step 2: Run tests to verify they fail**

Run: `cd toony_agent_runner && python -m pytest tests/test_download.py -v`
Expected: FAIL — `ModuleNotFoundError`

**Step 3: Write implementation**

```python
# toony_agent_runner/commands/download.py
"""Download commands: download from URL, download from backend."""

from __future__ import annotations

import asyncio
import urllib.request
import urllib.error
from pathlib import Path
from typing import Any

from .registry import CommandResult, resolve_safe_path


async def download_url(args: dict[str, Any], working_dir: Path) -> CommandResult:
    url = args.get("url")
    dest_str = args.get("destination")
    if not url or not dest_str:
        return CommandResult(success=False, error="Missing required args: url, destination")
    try:
        dest = resolve_safe_path(working_dir, dest_str)
    except ValueError as exc:
        return CommandResult(success=False, error=str(exc))

    dest.parent.mkdir(parents=True, exist_ok=True)

    def _fetch() -> None:
        urllib.request.urlretrieve(url, str(dest))

    try:
        await asyncio.get_running_loop().run_in_executor(None, _fetch)
    except Exception as exc:
        return CommandResult(success=False, error=f"Download failed: {exc}")

    return CommandResult(success=True, output=f"Downloaded: {url} -> {dest_str}")


async def download_backend(args: dict[str, Any], working_dir: Path) -> CommandResult:
    url = args.get("download_url")
    dest_str = args.get("destination")
    api_key = args.get("api_key")
    if not url or not dest_str or not api_key:
        return CommandResult(
            success=False, error="Missing required args: download_url, destination, api_key"
        )
    try:
        dest = resolve_safe_path(working_dir, dest_str)
    except ValueError as exc:
        return CommandResult(success=False, error=str(exc))

    dest.parent.mkdir(parents=True, exist_ok=True)

    def _fetch() -> None:
        req = urllib.request.Request(url)
        req.add_header("Authorization", f"Bearer {api_key}")
        with urllib.request.urlopen(req) as response:
            dest.write_bytes(response.read())

    try:
        await asyncio.get_running_loop().run_in_executor(None, _fetch)
    except urllib.error.HTTPError as exc:
        return CommandResult(success=False, error=f"Backend download failed (HTTP {exc.code}): {exc.reason}")
    except Exception as exc:
        return CommandResult(success=False, error=f"Download failed: {exc}")

    return CommandResult(success=True, output=f"Downloaded from backend: {dest_str}")
```

Then add to `registry.py` at the bottom:

```python
from .download import download_url, download_backend

COMMAND_REGISTRY.update({
    "download_url": download_url,
    "download_backend": download_backend,
})
```

**Step 4: Run tests to verify they pass**

Run: `cd toony_agent_runner && python -m pytest tests/test_download.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/commands/download.py toony_agent_runner/toony_agent_runner/commands/registry.py toony_agent_runner/tests/test_download.py
git commit -m "feat(runner): add download commands — download_url, download_backend"
```

---

### Task 4: Git clone command

**Files:**
- Create: `toony_agent_runner/toony_agent_runner/commands/git.py`
- Modify: `toony_agent_runner/toony_agent_runner/commands/registry.py` (add to COMMAND_REGISTRY)
- Create: `toony_agent_runner/tests/test_git.py`

**Step 1: Write the failing tests**

```python
# tests/test_git.py
"""Tests for git commands."""

from __future__ import annotations

import asyncio
import subprocess
from pathlib import Path

import pytest

from toony_agent_runner.commands.git import git_clone


@pytest.fixture()
def local_repo(tmp_path: Path) -> Path:
    """Create a bare git repo to clone from (avoids network)."""
    repo = tmp_path / "origin.git"
    subprocess.run(["git", "init", "--bare", str(repo)], check=True, capture_output=True)
    # Create a commit so clone has something to pull.
    work = tmp_path / "work_init"
    subprocess.run(["git", "clone", str(repo), str(work)], check=True, capture_output=True)
    (work / "README.md").write_text("hello")
    subprocess.run(["git", "-C", str(work), "add", "."], check=True, capture_output=True)
    subprocess.run(
        ["git", "-C", str(work), "commit", "-m", "init"],
        check=True, capture_output=True,
        env={"GIT_AUTHOR_NAME": "Test", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "Test", "GIT_COMMITTER_EMAIL": "t@t", "HOME": str(tmp_path), "PATH": "/usr/bin:/bin:/usr/local/bin"},
    )
    subprocess.run(["git", "-C", str(work), "push"], check=True, capture_output=True)
    return repo


class TestGitClone:
    def test_clones_repo(self, tmp_path: Path, local_repo: Path):
        work = tmp_path / "sandbox"
        work.mkdir()
        result = asyncio.run(
            git_clone({"repo_url": str(local_repo), "destination": "myproject"}, work)
        )
        assert result.success is True
        assert (work / "myproject" / "README.md").read_text() == "hello"

    def test_default_destination(self, tmp_path: Path, local_repo: Path):
        work = tmp_path / "sandbox"
        work.mkdir()
        result = asyncio.run(
            git_clone({"repo_url": str(local_repo)}, work)
        )
        assert result.success is True
        # Default destination is repo name without .git
        assert (work / "origin" / "README.md").exists()

    def test_invalid_repo(self, tmp_path: Path):
        work = tmp_path / "sandbox"
        work.mkdir()
        result = asyncio.run(
            git_clone({"repo_url": "/nonexistent/repo.git", "destination": "out"}, work)
        )
        assert result.success is False

    def test_missing_args(self, tmp_path: Path):
        result = asyncio.run(git_clone({}, tmp_path))
        assert result.success is False
```

**Step 2: Run tests to verify they fail**

Run: `cd toony_agent_runner && python -m pytest tests/test_git.py -v`
Expected: FAIL — `ModuleNotFoundError`

**Step 3: Write implementation**

```python
# toony_agent_runner/commands/git.py
"""Git commands: clone."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from .registry import CommandResult, resolve_safe_path


async def git_clone(args: dict[str, Any], working_dir: Path) -> CommandResult:
    repo_url = args.get("repo_url")
    if not repo_url:
        return CommandResult(success=False, error="Missing required arg: repo_url")

    dest_str = args.get("destination")
    if dest_str:
        try:
            resolve_safe_path(working_dir, dest_str)
        except ValueError as exc:
            return CommandResult(success=False, error=str(exc))

    cmd = ["git", "clone", repo_url]
    if dest_str:
        cmd.append(dest_str)

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=str(working_dir),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        error_msg = stderr.decode().strip() or f"git clone exited with {proc.returncode}"
        return CommandResult(success=False, error=error_msg)

    return CommandResult(
        success=True,
        output=f"Cloned: {repo_url}" + (f" -> {dest_str}" if dest_str else ""),
    )
```

Then add to `registry.py` at the bottom:

```python
from .git import git_clone

COMMAND_REGISTRY.update({
    "git_clone": git_clone,
})
```

**Step 4: Run tests to verify they pass**

Run: `cd toony_agent_runner && python -m pytest tests/test_git.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/commands/git.py toony_agent_runner/toony_agent_runner/commands/registry.py toony_agent_runner/tests/test_git.py
git commit -m "feat(runner): add git_clone command"
```

---

### Task 5: Script execution command

**Files:**
- Create: `toony_agent_runner/toony_agent_runner/commands/scripts.py`
- Modify: `toony_agent_runner/toony_agent_runner/commands/registry.py` (add to COMMAND_REGISTRY)
- Create: `toony_agent_runner/tests/test_scripts.py`

**Step 1: Write the failing tests**

```python
# tests/test_scripts.py
"""Tests for script execution commands."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import pytest

from toony_agent_runner.commands.scripts import run_script


class TestRunScript:
    def test_runs_python_script(self, tmp_path: Path):
        script = tmp_path / "hello.py"
        script.write_text("print('hello from python')")
        result = asyncio.run(run_script({"path": "hello.py"}, tmp_path))
        assert result.success is True
        assert "hello from python" in result.output

    def test_runs_bash_script(self, tmp_path: Path):
        script = tmp_path / "hello.sh"
        script.write_text("#!/bin/bash\necho 'hello from bash'")
        script.chmod(0o755)
        result = asyncio.run(run_script({"path": "hello.sh"}, tmp_path))
        assert result.success is True
        assert "hello from bash" in result.output

    def test_passes_args(self, tmp_path: Path):
        script = tmp_path / "args.py"
        script.write_text("import sys; print(' '.join(sys.argv[1:]))")
        result = asyncio.run(
            run_script({"path": "args.py", "args": ["foo", "bar"]}, tmp_path)
        )
        assert result.success is True
        assert "foo bar" in result.output

    def test_rejects_disallowed_extension(self, tmp_path: Path):
        script = tmp_path / "evil.rb"
        script.write_text("puts 'hi'")
        result = asyncio.run(run_script({"path": "evil.rb"}, tmp_path))
        assert result.success is False
        assert "extension" in result.error.lower()

    def test_script_not_found(self, tmp_path: Path):
        result = asyncio.run(run_script({"path": "nope.py"}, tmp_path))
        assert result.success is False

    def test_script_failure_returns_error(self, tmp_path: Path):
        script = tmp_path / "fail.py"
        script.write_text("raise RuntimeError('boom')")
        result = asyncio.run(run_script({"path": "fail.py"}, tmp_path))
        assert result.success is False
        assert "boom" in result.error

    def test_traversal_blocked(self, tmp_path: Path):
        result = asyncio.run(run_script({"path": "../../etc/evil.sh"}, tmp_path))
        assert result.success is False
        assert "escapes sandbox" in result.error

    def test_missing_args(self, tmp_path: Path):
        result = asyncio.run(run_script({}, tmp_path))
        assert result.success is False
```

**Step 2: Run tests to verify they fail**

Run: `cd toony_agent_runner && python -m pytest tests/test_scripts.py -v`
Expected: FAIL — `ModuleNotFoundError`

**Step 3: Write implementation**

```python
# toony_agent_runner/commands/scripts.py
"""Script execution command: run .sh, .bash, .py files."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any

from .registry import CommandResult, resolve_safe_path

_ALLOWED_EXTENSIONS = {".sh", ".bash", ".py"}

_INTERPRETERS: dict[str, list[str]] = {
    ".py": [sys.executable],
    ".sh": ["/bin/sh"],
    ".bash": ["/bin/bash"],
}


async def run_script(args: dict[str, Any], working_dir: Path) -> CommandResult:
    path_str = args.get("path")
    if not path_str:
        return CommandResult(success=False, error="Missing required arg: path")

    try:
        script_path = resolve_safe_path(working_dir, path_str)
    except ValueError as exc:
        return CommandResult(success=False, error=str(exc))

    if not script_path.exists():
        return CommandResult(success=False, error=f"Script not found: {path_str}")

    ext = script_path.suffix.lower()
    if ext not in _ALLOWED_EXTENSIONS:
        return CommandResult(
            success=False,
            error=f"Disallowed extension: {ext}. Allowed: {', '.join(sorted(_ALLOWED_EXTENSIONS))}",
        )

    interpreter = _INTERPRETERS[ext]
    extra_args = args.get("args", [])
    cmd = [*interpreter, str(script_path), *extra_args]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=str(working_dir),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        error_msg = stderr.decode().strip() or f"Script exited with code {proc.returncode}"
        return CommandResult(success=False, error=error_msg)

    return CommandResult(success=True, output=stdout.decode().strip())
```

Then add to `registry.py` at the bottom:

```python
from .scripts import run_script

COMMAND_REGISTRY.update({
    "run_script": run_script,
})
```

**Step 4: Run tests to verify they pass**

Run: `cd toony_agent_runner && python -m pytest tests/test_scripts.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/commands/scripts.py toony_agent_runner/toony_agent_runner/commands/registry.py toony_agent_runner/tests/test_scripts.py
git commit -m "feat(runner): add run_script command — execute .sh, .bash, .py in sandbox"
```

---

### Task 6: Protocol messages — `CommandExecute` and `CommandResultMessage`

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/protocol.py:119-211` (add new dataclasses + update parser)
- Create: `toony_agent_runner/tests/test_protocol.py`

**Step 1: Write the failing tests**

```python
# tests/test_protocol.py
"""Tests for command protocol messages."""

from __future__ import annotations

import pytest

from toony_agent_runner.commands.registry import CommandResult
from toony_agent_runner.protocol import (
    CommandExecute,
    CommandResultMessage,
    parse_server_message,
)


class TestCommandExecute:
    def test_parse_command_execute(self):
        raw = {
            "type": "command.execute",
            "command_id": "abc-123",
            "command_key": "create_file",
            "args": {"path": "test.txt", "content": "hello"},
        }
        msg = parse_server_message(raw)
        assert isinstance(msg, CommandExecute)
        assert msg.command_id == "abc-123"
        assert msg.command_key == "create_file"
        assert msg.args == {"path": "test.txt", "content": "hello"}

    def test_parse_command_execute_empty_args(self):
        raw = {
            "type": "command.execute",
            "command_id": "abc-123",
            "command_key": "create_dir",
            "args": {},
        }
        msg = parse_server_message(raw)
        assert isinstance(msg, CommandExecute)
        assert msg.args == {}


class TestCommandResultMessage:
    def test_success_to_json(self):
        msg = CommandResultMessage(
            command_id="abc-123", success=True, output="done"
        )
        j = msg.to_json()
        assert j == {
            "type": "command.result",
            "command_id": "abc-123",
            "success": True,
            "output": "done",
            "error": "",
        }

    def test_failure_to_json(self):
        msg = CommandResultMessage(
            command_id="abc-123", success=False, error="boom"
        )
        j = msg.to_json()
        assert j["success"] is False
        assert j["error"] == "boom"
```

**Step 2: Run tests to verify they fail**

Run: `cd toony_agent_runner && python -m pytest tests/test_protocol.py -v`
Expected: FAIL — `ImportError: cannot import name 'CommandExecute' from 'toony_agent_runner.protocol'`

**Step 3: Write implementation**

Add to `protocol.py` — **after** the existing `HeartbeatAck` class (around line 164) but **before** the `# Message parsing` section:

```python
@dataclass
class CommandExecute:
    """Backend sends a command for the runner to execute directly."""

    command_id: str
    command_key: str
    args: dict[str, Any] = field(default_factory=dict)


@dataclass
class CommandResultMessage:
    """Runner reports the result of a command execution."""

    command_id: str
    success: bool
    output: str = ""
    error: str = ""

    def to_json(self) -> dict:
        return {
            "type": "command.result",
            "command_id": self.command_id,
            "success": self.success,
            "output": self.output,
            "error": self.error,
        }
```

Update the `IncomingMessage` type alias (line 172):

```python
IncomingMessage = TaskAssign | ApprovalResponse | TaskCancel | TaskReply | HeartbeatAck | CommandExecute
```

Add a new block in `parse_server_message` **before** the final `raise ValueError` (around line 208):

```python
    if msg_type == "command.execute":
        return CommandExecute(
            command_id=data["command_id"],
            command_key=data["command_key"],
            args=data.get("args", {}),
        )
```

Update the module docstring at the top to include the new messages.

**Step 4: Run tests to verify they pass**

Run: `cd toony_agent_runner && python -m pytest tests/test_protocol.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/protocol.py toony_agent_runner/tests/test_protocol.py
git commit -m "feat(runner): add CommandExecute and CommandResultMessage to protocol"
```

---

### Task 7: Main loop integration — `_handle_command` + dispatch

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/main.py:31-45` (imports) and `main.py:768-830` (message handling loop)

**Step 1: Add imports to `main.py`**

At the top of `main.py`, add to the protocol imports (around line 31-45):

```python
from .protocol import (
    # ... existing imports ...
    CommandExecute,
    CommandResultMessage,
)
```

Add command execution import:

```python
from .commands import execute_command
```

**Step 2: Add `_handle_command` function**

Add after `execute_task_reply` function (around line 680), before the `# Main loop` section:

```python
# ---------------------------------------------------------------------------
# Command execution
# ---------------------------------------------------------------------------

async def _handle_command(
    msg: CommandExecute,
    conn: BackendConnection,
    config: RunnerConfig,
) -> None:
    """Execute a backend command and send the result back."""
    working_dir = Path(config.claude.working_directory).resolve()

    # Inject backend credentials for download_backend.
    if msg.command_key == "download_backend":
        msg.args.setdefault("api_key", config.api_key)
        # Convert ws:// -> http:// for REST downloads.
        backend_http = config.backend_url.replace("ws://", "http://").replace("wss://", "https://")
        msg.args.setdefault("backend_http_url", backend_http)

    logger.info("Executing command: %s (id=%s)", msg.command_key, msg.command_id)
    result = await execute_command(msg.command_key, msg.args, working_dir)
    logger.info(
        "Command %s (id=%s) result: success=%s",
        msg.command_key, msg.command_id, result.success,
    )

    await conn.send(
        CommandResultMessage(
            command_id=msg.command_id,
            success=result.success,
            output=result.output,
            error=result.error,
        ).to_json()
    )
```

**Step 3: Add dispatch branch in main loop**

In the `run()` function's message handling block (after the `HeartbeatAck` handler, around line 831), add:

```python
            elif isinstance(msg, CommandExecute):
                logger.info(
                    "Received command.execute: %s (id=%s)",
                    msg.command_key, msg.command_id,
                )
                asyncio.create_task(_handle_command(msg, conn, config))
```

**Step 4: Run all tests**

Run: `cd toony_agent_runner && python -m pytest tests/ -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/main.py
git commit -m "feat(runner): integrate command execution into main loop"
```

---

### Task 8: Full integration test

**Files:**
- Create: `toony_agent_runner/tests/test_integration.py`

**Step 1: Write integration test**

```python
# tests/test_integration.py
"""Integration test: execute_command dispatches to correct handler."""

from __future__ import annotations

import asyncio
from pathlib import Path

from toony_agent_runner.commands import execute_command, COMMAND_REGISTRY


class TestFullRegistry:
    """Verify all 9 commands are registered and dispatch correctly."""

    EXPECTED_KEYS = [
        "create_dir", "create_file", "move_file", "rename_file", "copy_file",
        "download_url", "download_backend",
        "git_clone",
        "run_script",
    ]

    def test_all_commands_registered(self):
        for key in self.EXPECTED_KEYS:
            assert key in COMMAND_REGISTRY, f"{key} not in registry"

    def test_registry_has_no_extras(self):
        assert set(COMMAND_REGISTRY.keys()) == set(self.EXPECTED_KEYS)


class TestExecuteCommandDispatch:
    def test_create_dir_via_dispatch(self, tmp_path: Path):
        result = asyncio.run(
            execute_command("create_dir", {"path": "test_dir"}, tmp_path)
        )
        assert result.success is True
        assert (tmp_path / "test_dir").is_dir()

    def test_create_file_via_dispatch(self, tmp_path: Path):
        result = asyncio.run(
            execute_command(
                "create_file",
                {"path": "test.txt", "content": "hello"},
                tmp_path,
            )
        )
        assert result.success is True
        assert (tmp_path / "test.txt").read_text() == "hello"

    def test_unknown_command_via_dispatch(self, tmp_path: Path):
        result = asyncio.run(
            execute_command("nonexistent", {}, tmp_path)
        )
        assert result.success is False
        assert "Unknown command" in result.error

    def test_handler_exception_caught(self, tmp_path: Path):
        """If a handler raises, execute_command catches and returns error."""
        result = asyncio.run(
            execute_command("run_script", {"path": "../../etc/passwd"}, tmp_path)
        )
        assert result.success is False
```

**Step 2: Run full test suite**

Run: `cd toony_agent_runner && python -m pytest tests/ -v`
Expected: All PASS

**Step 3: Commit**

```bash
git add toony_agent_runner/tests/test_integration.py
git commit -m "test(runner): add integration tests for command execution dispatch"
```

---

### Task 9: Update CLAUDE.md and README.md

**Files:**
- Modify: `toony_agent_runner/CLAUDE.md`
- Modify: `toony_agent_runner/README.md`

**Step 1: Update CLAUDE.md**

Add to the Architecture section a 5th module:

```
  +-- commands/         --- Command execution: registry of filesystem/download/git/script handlers,
                             sandboxed to working_directory, dispatched independently of Claude tasks
```

Add to the WebSocket Protocol table:

```
| In  | `command.execute`  | Backend sends a direct command (key + args) |
| Out | `command.result`   | Runner reports command execution result      |
```

Add to the Lifecycle Flow, under IDLE LOOP:

```
  │    ├─ On "command.execute":
  │    │    ├─ Look up command_key in COMMAND_REGISTRY
  │    │    ├─ Execute handler with args (sandboxed to working_dir)
  │    │    └─ Send "command.result" with success/error
```

**Step 2: Update README.md**

Add a "## Commands" section (after Architecture) documenting:
- The command execution feature
- Table of available commands with their keys and args
- Example JSON request/response

**Step 3: Commit**

```bash
git add toony_agent_runner/CLAUDE.md toony_agent_runner/README.md
git commit -m "docs(runner): document command execution system in CLAUDE.md and README.md"
```

---

### Task 10: Bump version

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/__init__.py`
- Modify: `toony_agent_runner/pyproject.toml`

**Step 1: Bump to 0.3.0**

In `__init__.py`: change `__version__ = "0.2.0"` to `__version__ = "0.3.0"`
In `pyproject.toml`: change `version = "0.2.0"` to `version = "0.3.0"`

**Step 2: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/__init__.py toony_agent_runner/pyproject.toml
git commit -m "chore(runner): bump version to 0.3.0 — command execution"
```
