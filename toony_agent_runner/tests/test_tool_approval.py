"""Tests for tool approval configuration and rule evaluation."""

from __future__ import annotations

import pytest

from toony_agent_runner.config import ClaudeConfig, ToolApprovalConfig, load_config


class TestToolApprovalConfig:

    def test_defaults(self):
        config = ToolApprovalConfig()
        assert config.default_action == "ask"
        assert config.timeout == 120
        assert config.rules == {}

    def test_custom_values(self):
        config = ToolApprovalConfig(
            default_action="allow",
            timeout=60,
            rules={"Read": "allow", "Bash": "ask", "Bash(rm *)": "deny"},
        )
        assert config.default_action == "allow"
        assert config.timeout == 60
        assert config.rules["Bash(rm *)"] == "deny"

    def test_claude_config_includes_tool_approval(self):
        config = ClaudeConfig()
        assert isinstance(config.tool_approval, ToolApprovalConfig)
        assert config.tool_approval.default_action == "ask"
