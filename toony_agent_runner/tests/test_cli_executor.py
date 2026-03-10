# tests/test_cli_executor.py
"""Tests for CLI executor."""

from __future__ import annotations

import asyncio
import json
import pytest

from toony_agent_runner.cli_executor import build_claude_command, parse_stream_event
from toony_agent_runner.config import ClaudeConfig


class TestBuildClaudeCommand:
    def test_basic_command(self):
        config = ClaudeConfig(
            working_directory="/tmp/test",
            permission_mode="acceptEdits",
        )
        cmd = build_claude_command("hello", config)
        assert cmd[0] == "claude"
        assert "-p" in cmd
        assert "hello" in cmd
        assert "--output-format" in cmd
        idx = cmd.index("--output-format")
        assert cmd[idx + 1] == "stream-json"
        assert "--verbose" in cmd

    def test_with_resume(self):
        config = ClaudeConfig()
        cmd = build_claude_command("hello", config, resume_session_id="abc-123")
        assert "--resume" in cmd
        idx = cmd.index("--resume")
        assert cmd[idx + 1] == "abc-123"

    def test_with_session_id(self):
        config = ClaudeConfig()
        cmd = build_claude_command("hello", config, session_id="xyz-789")
        assert "--session-id" in cmd
        idx = cmd.index("--session-id")
        assert cmd[idx + 1] == "xyz-789"

    def test_resume_takes_precedence_over_session_id(self):
        config = ClaudeConfig()
        cmd = build_claude_command(
            "hello", config, session_id="xyz", resume_session_id="abc"
        )
        assert "--resume" in cmd
        assert "--session-id" not in cmd

    def test_with_disallowed_tools(self):
        config = ClaudeConfig(disallowed_tools=["Bash(git:*)", "Edit"])
        cmd = build_claude_command("hello", config)
        assert "--disallowed-tools" in cmd
        idx = cmd.index("--disallowed-tools")
        assert cmd[idx + 1] == "Bash(git:*) Edit"

    def test_permission_mode(self):
        config = ClaudeConfig(permission_mode="bypassPermissions")
        cmd = build_claude_command("hello", config)
        assert "--permission-mode" in cmd
        idx = cmd.index("--permission-mode")
        assert cmd[idx + 1] == "bypassPermissions"


class TestParseStreamEvent:
    def test_system_init(self):
        raw = {"type": "system", "subtype": "init", "session_id": "abc-123"}
        event = parse_stream_event(raw)
        assert event["type"] == "system"
        assert event["session_id"] == "abc-123"

    def test_assistant_with_text(self):
        raw = {
            "type": "assistant",
            "message": {
                "content": [{"type": "text", "text": "Hello"}],
            },
            "session_id": "abc",
        }
        event = parse_stream_event(raw)
        assert event["type"] == "assistant"

    def test_assistant_with_tool_use(self):
        raw = {
            "type": "assistant",
            "message": {
                "content": [
                    {"type": "tool_use", "name": "Read", "id": "tu1", "input": {"file_path": "/tmp/x"}},
                ],
            },
            "session_id": "abc",
        }
        event = parse_stream_event(raw)
        assert event["type"] == "assistant"

    def test_result_success(self):
        raw = {
            "type": "result",
            "subtype": "success",
            "is_error": False,
            "result": "done",
            "session_id": "abc",
        }
        event = parse_stream_event(raw)
        assert event["type"] == "result"
        assert event["is_error"] is False

    def test_result_error(self):
        raw = {
            "type": "result",
            "subtype": "error",
            "is_error": True,
            "result": "boom",
            "session_id": "abc",
        }
        event = parse_stream_event(raw)
        assert event["type"] == "result"
        assert event["is_error"] is True

    def test_unknown_type_passes_through(self):
        raw = {"type": "rate_limit_event", "data": {}}
        event = parse_stream_event(raw)
        assert event["type"] == "rate_limit_event"


class TestExtractQuestionFromAssistant:
    def test_extracts_structured_questions_format(self):
        from toony_agent_runner.cli_executor import extract_question_from_assistant

        raw = {
            "type": "assistant",
            "message": {
                "content": [
                    {
                        "type": "tool_use",
                        "name": "AskUserQuestion",
                        "id": "tu1",
                        "input": {
                            "questions": [
                                {
                                    "question": "What framework?",
                                    "header": "Setup",
                                    "options": [
                                        {"label": "React", "description": "Frontend lib"},
                                        {"label": "Vue", "description": "Alternative"},
                                    ],
                                    "multiSelect": False,
                                }
                            ]
                        },
                    },
                ],
            },
            "session_id": "abc",
        }
        question = extract_question_from_assistant(raw)
        assert question is not None
        assert question["text"] == "What framework?"
        assert question["header"] == "Setup"
        assert len(question["options"]) == 2
        assert question["options"][0]["label"] == "React"
        assert question["multi_select"] is False

    def test_extracts_simple_question_format(self):
        """Backwards compat: old format with top-level 'question' key."""
        from toony_agent_runner.cli_executor import extract_question_from_assistant

        raw = {
            "type": "assistant",
            "message": {
                "content": [
                    {
                        "type": "tool_use",
                        "name": "AskUserQuestion",
                        "id": "tu1",
                        "input": {"question": "What framework?"},
                    },
                ],
            },
            "session_id": "abc",
        }
        question = extract_question_from_assistant(raw)
        assert question is not None
        assert question["text"] == "What framework?"
        assert question["header"] is None
        assert question["options"] == []
        assert question["multi_select"] is False

    def test_extracts_structured_without_options(self):
        from toony_agent_runner.cli_executor import extract_question_from_assistant

        raw = {
            "type": "assistant",
            "message": {
                "content": [
                    {
                        "type": "tool_use",
                        "name": "AskUserQuestion",
                        "id": "tu1",
                        "input": {
                            "questions": [
                                {"question": "What's your name?"}
                            ]
                        },
                    },
                ],
            },
            "session_id": "abc",
        }
        question = extract_question_from_assistant(raw)
        assert question is not None
        assert question["text"] == "What's your name?"
        assert question["options"] == []

    def test_returns_none_for_no_question(self):
        from toony_agent_runner.cli_executor import extract_question_from_assistant

        raw = {
            "type": "assistant",
            "message": {
                "content": [
                    {"type": "tool_use", "name": "Read", "id": "tu1", "input": {}},
                ],
            },
            "session_id": "abc",
        }
        question = extract_question_from_assistant(raw)
        assert question is None


class TestExtractToolEvents:
    def test_extracts_tool_use_events(self):
        from toony_agent_runner.cli_executor import extract_tool_events

        raw = {
            "type": "assistant",
            "message": {
                "content": [
                    {"type": "text", "text": "I'll read the file."},
                    {
                        "type": "tool_use",
                        "name": "Read",
                        "id": "tu1",
                        "input": {"file_path": "/tmp/test.py"},
                    },
                    {
                        "type": "tool_use",
                        "name": "Edit",
                        "id": "tu2",
                        "input": {"file_path": "/tmp/test.py", "old_string": "a", "new_string": "b"},
                    },
                ],
            },
            "session_id": "abc",
        }
        events = extract_tool_events(raw)
        assert len(events) == 2
        assert events[0]["tool_name"] == "Read"
        assert events[0]["input"]["file_path"] == "/tmp/test.py"
        assert events[1]["tool_name"] == "Edit"

    def test_skips_ask_user_question(self):
        from toony_agent_runner.cli_executor import extract_tool_events

        raw = {
            "type": "assistant",
            "message": {
                "content": [
                    {
                        "type": "tool_use",
                        "name": "AskUserQuestion",
                        "id": "tu1",
                        "input": {"question": "?"},
                    },
                ],
            },
            "session_id": "abc",
        }
        events = extract_tool_events(raw)
        assert len(events) == 0
