# tests/test_protocol.py
"""Tests for command and config sync protocol messages."""

from __future__ import annotations

import pytest

from toony_agent_runner.protocol import (
    CommandExecute,
    CommandResultMessage,
    ConfigSync,
    ConfigSyncAckMessage,
    QuestionAskedMessage,
    QuestionAnswered,
    TaskAssign,
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


class TestConfigSync:
    def test_parse_config_sync_with_orgs(self):
        raw = {
            "type": "config.sync",
            "organizations": [
                {"id": "org-1", "name": "Acme Corp", "projects": []},
                {"id": "org-2", "name": "Widgets Inc", "projects": [{"id": "p-1"}]},
            ],
        }
        msg = parse_server_message(raw)
        assert isinstance(msg, ConfigSync)
        assert len(msg.organizations) == 2
        assert msg.organizations[0]["id"] == "org-1"
        assert msg.organizations[1]["name"] == "Widgets Inc"

    def test_parse_config_sync_empty_orgs(self):
        raw = {"type": "config.sync"}
        msg = parse_server_message(raw)
        assert isinstance(msg, ConfigSync)
        assert msg.organizations == []


class TestConfigSyncAckMessage:
    def test_success_to_json(self):
        msg = ConfigSyncAckMessage(
            success=True, org_count=3, project_count=7
        )
        j = msg.to_json()
        assert j == {
            "type": "config.sync.ack",
            "success": True,
            "org_count": 3,
            "project_count": 7,
            "error": "",
        }

    def test_failure_to_json(self):
        msg = ConfigSyncAckMessage(
            success=False, error="validation failed"
        )
        j = msg.to_json()
        assert j == {
            "type": "config.sync.ack",
            "success": False,
            "org_count": 0,
            "project_count": 0,
            "error": "validation failed",
        }


class TestQuestionAskedMessage:
    def test_to_json_with_options(self):
        msg = QuestionAskedMessage(
            task_id="task-1",
            session_id="sess-1",
            question_id="q-1",
            question_data={
                "text": "What framework?",
                "type": "options",
                "header": "Setup",
                "options": [{"label": "React", "description": "Frontend lib"}],
                "multi_select": False,
            },
        )
        j = msg.to_json()
        assert j == {
            "type": "question.asked",
            "task_id": "task-1",
            "session_id": "sess-1",
            "question_id": "q-1",
            "question": {
                "text": "What framework?",
                "type": "options",
                "header": "Setup",
                "options": [{"label": "React", "description": "Frontend lib"}],
                "multi_select": False,
            },
        }

    def test_to_json_free_text(self):
        msg = QuestionAskedMessage(
            task_id="task-1",
            session_id="sess-1",
            question_id="q-1",
            question_data={
                "text": "What's your name?",
                "type": "free_text",
            },
        )
        j = msg.to_json()
        assert j["question"]["type"] == "free_text"
        assert j["question"]["text"] == "What's your name?"


class TestQuestionAnswered:
    def test_parse_question_answered(self):
        raw = {
            "type": "question.answered",
            "task_id": "task-1",
            "question_id": "q-1",
            "answer": "React",
            "session_id": "sess-abc",
            "sequence_offset": 5,
        }
        msg = parse_server_message(raw)
        assert isinstance(msg, QuestionAnswered)
        assert msg.task_id == "task-1"
        assert msg.question_id == "q-1"
        assert msg.answer == "React"
        assert msg.session_id == "sess-abc"
        assert msg.sequence_offset == 5

    def test_parse_question_answered_defaults(self):
        raw = {
            "type": "question.answered",
            "task_id": "task-1",
            "question_id": "q-1",
            "answer": "React",
        }
        msg = parse_server_message(raw)
        assert isinstance(msg, QuestionAnswered)
        assert msg.session_id == ""
        assert msg.sequence_offset == 0


class TestTaskAssignProjectId:
    def test_parse_with_project_id(self):
        raw = {
            "type": "task.assign",
            "task_id": "task-1",
            "title": "Fix bug",
            "prompt": "Fix the login bug",
            "project_id": "proj-42",
        }
        msg = parse_server_message(raw)
        assert isinstance(msg, TaskAssign)
        assert msg.project_id == "proj-42"
        assert msg.task_id == "task-1"

    def test_parse_without_project_id(self):
        raw = {
            "type": "task.assign",
            "task_id": "task-2",
            "title": "General task",
            "prompt": "Do something",
        }
        msg = parse_server_message(raw)
        assert isinstance(msg, TaskAssign)
        assert msg.project_id is None
