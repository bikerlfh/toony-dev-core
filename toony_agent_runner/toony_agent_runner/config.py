"""Runner configuration dataclasses and YAML loader."""

from __future__ import annotations

import logging
import sys
from dataclasses import dataclass, field
from pathlib import Path

import yaml

logger = logging.getLogger("toony_agent_runner")

_DEFAULT_ALLOWED_TOOLS = [
    "Read", "Edit", "Write", "Bash", "Grep", "Glob",
    "WebFetch", "WebSearch", "NotebookEdit",
    # NOTE: AskUserQuestion is intentionally excluded from this list.
    # Approval gating is handled by a PreToolUse hook (not can_use_tool)
    # which fires for ALL tool uses regardless of permission settings.
]


@dataclass
class ClaudeConfig:
    working_directory: str = "."
    max_task_timeout: int = 3600
    approval_timeout: int = 600  # 10 minutes
    max_concurrent_tasks: int = 1
    oauth_token: str = ""
    permission_mode: str = "acceptEdits"
    allowed_tools: list[str] = field(default_factory=lambda: list(_DEFAULT_ALLOWED_TOOLS))


@dataclass
class ReconnectConfig:
    max_retries: int = -1
    backoff_base: float = 1.0
    backoff_max: float = 30.0


@dataclass
class RunnerConfig:
    backend_url: str = "ws://localhost:8000/ws/toony-agents/runner/"
    api_key: str = ""
    workspace_root: str = ""
    claude: ClaudeConfig = field(default_factory=ClaudeConfig)
    reconnect: ReconnectConfig = field(default_factory=ReconnectConfig)


def load_config(path: str) -> RunnerConfig:
    """Load configuration from a YAML file."""
    config_path = Path(path)
    if not config_path.exists():
        logger.error("Config file not found: %s", path)
        sys.exit(1)

    with open(config_path) as f:
        raw = yaml.safe_load(f) or {}

    claude_raw = raw.get("claude", {})
    reconnect_raw = raw.get("reconnect", {})

    return RunnerConfig(
        backend_url=raw.get("backend_url", RunnerConfig.backend_url),
        api_key=raw.get("api_key", ""),
        workspace_root=raw.get("workspace_root", ""),
        claude=ClaudeConfig(
            working_directory=claude_raw.get(
                "working_directory", ClaudeConfig.working_directory
            ),
            max_task_timeout=claude_raw.get(
                "max_task_timeout", ClaudeConfig.max_task_timeout
            ),
            approval_timeout=claude_raw.get(
                "approval_timeout", ClaudeConfig.approval_timeout
            ),
            max_concurrent_tasks=claude_raw.get(
                "max_concurrent_tasks", ClaudeConfig.max_concurrent_tasks
            ),
            oauth_token=claude_raw.get(
                "oauth_token", ClaudeConfig.oauth_token
            ),
            permission_mode=claude_raw.get(
                "permission_mode", ClaudeConfig.permission_mode
            ),
            allowed_tools=claude_raw.get(
                "allowed_tools", _DEFAULT_ALLOWED_TOOLS
            ),
        ),
        reconnect=ReconnectConfig(
            max_retries=reconnect_raw.get(
                "max_retries", ReconnectConfig.max_retries
            ),
            backoff_base=reconnect_raw.get(
                "backoff_base", ReconnectConfig.backoff_base
            ),
            backoff_max=reconnect_raw.get(
                "backoff_max", ReconnectConfig.backoff_max
            ),
        ),
    )
