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
