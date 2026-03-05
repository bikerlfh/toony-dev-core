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
