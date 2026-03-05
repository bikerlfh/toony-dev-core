# tests/test_protocol.py
"""Tests for command protocol messages."""

from __future__ import annotations

import pytest

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
