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
