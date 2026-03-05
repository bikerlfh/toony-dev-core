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
