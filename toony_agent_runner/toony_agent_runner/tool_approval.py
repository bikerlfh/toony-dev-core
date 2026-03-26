"""Tool approval rule evaluation for the control protocol."""

from __future__ import annotations

import fnmatch
import re
from typing import Any

# Maps tool name to the input field used for pattern matching.
_TOOL_PRIMARY_FIELD: dict[str, str] = {
    "Bash": "command",
    "Edit": "file_path",
    "Write": "file_path",
    "Read": "file_path",
    "Grep": "pattern",
    "Glob": "pattern",
    "WebFetch": "url",
    "WebSearch": "query",
}

_PATTERN_RE = re.compile(r"^(\w+)\((.+)\)$")


def evaluate_tool_rule(
    tool_name: str,
    tool_input: dict[str, Any],
    rules: dict[str, str],
    default_action: str,
) -> str:
    """Evaluate tool approval rules and return the action.

    Checks pattern rules first (e.g. ``Bash(rm *)``), then exact name
    rules (e.g. ``Bash``), then falls back to *default_action*.

    Returns ``"allow"``, ``"deny"``, or ``"ask"``.
    """
    # 1. Check pattern rules (most specific).
    primary_field = _TOOL_PRIMARY_FIELD.get(tool_name)
    if primary_field:
        primary_value = str(tool_input.get(primary_field, ""))
        for rule_key, action in rules.items():
            match = _PATTERN_RE.match(rule_key)
            if not match:
                continue
            rule_tool, pattern = match.group(1), match.group(2)
            if rule_tool == tool_name and fnmatch.fnmatch(primary_value, pattern):
                return action

    # 2. Check exact name rule.
    if tool_name in rules:
        return rules[tool_name]

    # 3. Default.
    return default_action
