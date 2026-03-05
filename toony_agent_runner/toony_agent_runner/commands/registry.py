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
