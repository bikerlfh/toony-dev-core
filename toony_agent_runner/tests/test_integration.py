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
