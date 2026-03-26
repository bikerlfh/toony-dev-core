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


from toony_agent_runner.tool_approval import evaluate_tool_rule


class TestEvaluateToolRule:

    def test_exact_tool_match(self):
        rules = {"Bash": "ask", "Read": "allow"}
        assert evaluate_tool_rule("Read", {}, rules, "ask") == "allow"
        assert evaluate_tool_rule("Bash", {}, rules, "ask") == "ask"

    def test_default_action_when_no_rule(self):
        rules = {"Read": "allow"}
        assert evaluate_tool_rule("Edit", {}, rules, "deny") == "deny"

    def test_pattern_rule_matches(self):
        rules = {"Bash(rm *)": "deny", "Bash": "ask"}
        assert evaluate_tool_rule("Bash", {"command": "rm -rf /"}, rules, "ask") == "deny"
        assert evaluate_tool_rule("Bash", {"command": "npm test"}, rules, "ask") == "ask"

    def test_pattern_rule_priority_over_exact(self):
        """Pattern rules are checked before exact name rules."""
        rules = {"Bash(git push --force*)": "deny", "Bash": "allow"}
        assert evaluate_tool_rule("Bash", {"command": "git push --force origin main"}, rules, "ask") == "deny"
        assert evaluate_tool_rule("Bash", {"command": "git status"}, rules, "ask") == "allow"

    def test_file_path_pattern(self):
        rules = {"Edit(~/.claude/skills/*)": "deny", "Edit": "ask"}
        assert evaluate_tool_rule("Edit", {"file_path": "~/.claude/skills/foo/SKILL.md"}, rules, "ask") == "deny"
        assert evaluate_tool_rule("Edit", {"file_path": "src/main.py"}, rules, "ask") == "ask"

    def test_empty_rules_uses_default(self):
        assert evaluate_tool_rule("Bash", {}, {}, "allow") == "allow"

    def test_unknown_tool_uses_default(self):
        rules = {"Read": "allow"}
        assert evaluate_tool_rule("mcp__toony__search", {}, rules, "ask") == "ask"
