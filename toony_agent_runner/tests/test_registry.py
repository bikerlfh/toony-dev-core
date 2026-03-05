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

    def test_dispatch_calls_handler(self, tmp_path: Path):
        expected = CommandResult(success=True, output="ok")

        async def mock_handler(args, working_dir):
            mock_handler.called_with = (args, working_dir)
            return expected

        COMMAND_REGISTRY["_test_cmd"] = mock_handler
        try:
            result = asyncio.run(execute_command("_test_cmd", {"a": 1}, tmp_path))
            assert result is expected
            assert mock_handler.called_with == ({"a": 1}, tmp_path)
        finally:
            del COMMAND_REGISTRY["_test_cmd"]

    def test_dispatch_handler_exception(self, tmp_path: Path):
        async def failing_handler(args, working_dir):
            raise RuntimeError("handler broke")

        COMMAND_REGISTRY["_test_fail"] = failing_handler
        try:
            result = asyncio.run(execute_command("_test_fail", {}, tmp_path))
            assert result.success is False
            assert "handler broke" in result.error
        finally:
            del COMMAND_REGISTRY["_test_fail"]
