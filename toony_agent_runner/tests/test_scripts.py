"""Tests for script execution command."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

import pytest

from toony_agent_runner.commands.scripts import run_script


class TestRunScript:
    def test_runs_python_script(self, tmp_path: Path):
        script = tmp_path / "hello.py"
        script.write_text("print('hello from python')")
        result = asyncio.run(run_script({"path": "hello.py"}, tmp_path))
        assert result.success is True
        assert result.output == "hello from python"

    def test_runs_bash_script(self, tmp_path: Path):
        script = tmp_path / "hello.sh"
        script.write_text("#!/bin/bash\necho 'hello from bash'")
        os.chmod(script, 0o755)
        result = asyncio.run(run_script({"path": "hello.sh"}, tmp_path))
        assert result.success is True
        assert result.output == "hello from bash"

    def test_passes_args(self, tmp_path: Path):
        script = tmp_path / "args.py"
        script.write_text("import sys\nprint(' '.join(sys.argv[1:]))")
        result = asyncio.run(
            run_script({"path": "args.py", "args": ["foo", "bar"]}, tmp_path)
        )
        assert result.success is True
        assert result.output == "foo bar"

    def test_rejects_disallowed_extension(self, tmp_path: Path):
        script = tmp_path / "evil.rb"
        script.write_text("puts 'nope'")
        result = asyncio.run(run_script({"path": "evil.rb"}, tmp_path))
        assert result.success is False
        assert "extension" in result.error.lower()

    def test_script_not_found(self, tmp_path: Path):
        result = asyncio.run(run_script({"path": "nope.py"}, tmp_path))
        assert result.success is False
        assert "not found" in result.error.lower()

    def test_script_failure_returns_error(self, tmp_path: Path):
        script = tmp_path / "fail.py"
        script.write_text("raise RuntimeError('boom')")
        result = asyncio.run(run_script({"path": "fail.py"}, tmp_path))
        assert result.success is False
        assert "boom" in result.error

    def test_traversal_blocked(self, tmp_path: Path):
        result = asyncio.run(
            run_script({"path": "../../etc/evil.sh"}, tmp_path)
        )
        assert result.success is False
        assert "escapes sandbox" in result.error

    def test_missing_args(self, tmp_path: Path):
        result = asyncio.run(run_script({}, tmp_path))
        assert result.success is False
        assert "Missing required arg: path" in result.error
