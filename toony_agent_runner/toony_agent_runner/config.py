"""Runner configuration dataclasses and YAML loader."""

from __future__ import annotations

import logging
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger("toony_agent_runner")

_DEFAULT_ALLOWED_TOOLS = [
    "Read", "Edit", "Write", "Bash", "Grep", "Glob",
    "WebFetch", "WebSearch", "NotebookEdit",
    "AskUserQuestion",
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
    disallowed_tools: list[str] = field(default_factory=list)


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
            disallowed_tools=claude_raw.get(
                "disallowed_tools", []
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


def save_config(path: str, config: RunnerConfig) -> None:
    """Persist the current configuration back to the YAML file.

    Reads the existing YAML first and merges only known fields so that
    extra keys the user added manually (e.g. ``binary``, ``output_format``)
    are preserved.
    """
    config_path = Path(path)

    # Read existing YAML to preserve unknown fields.
    if config_path.exists():
        with open(config_path) as f:
            data: dict[str, Any] = yaml.safe_load(f) or {}
    else:
        data = {}

    # Update top-level fields.
    data["backend_url"] = config.backend_url
    data["api_key"] = config.api_key
    if config.workspace_root:
        data["workspace_root"] = config.workspace_root

    # Merge claude section (preserve unknown keys).
    claude_data: dict[str, Any] = data.get("claude", {})
    if not isinstance(claude_data, dict):
        claude_data = {}
    claude_data["max_task_timeout"] = config.claude.max_task_timeout
    claude_data["max_concurrent_tasks"] = config.claude.max_concurrent_tasks
    claude_data["working_directory"] = config.claude.working_directory
    claude_data["approval_timeout"] = config.claude.approval_timeout
    claude_data["permission_mode"] = config.claude.permission_mode
    if config.claude.oauth_token:
        claude_data["oauth_token"] = config.claude.oauth_token
    if config.claude.allowed_tools != _DEFAULT_ALLOWED_TOOLS:
        claude_data["allowed_tools"] = config.claude.allowed_tools
    if config.claude.disallowed_tools:
        claude_data["disallowed_tools"] = config.claude.disallowed_tools
    data["claude"] = claude_data

    # Merge reconnect section (preserve unknown keys).
    reconnect_data: dict[str, Any] = data.get("reconnect", {})
    if not isinstance(reconnect_data, dict):
        reconnect_data = {}
    reconnect_data["max_retries"] = config.reconnect.max_retries
    reconnect_data["backoff_base"] = config.reconnect.backoff_base
    reconnect_data["backoff_max"] = config.reconnect.backoff_max
    data["reconnect"] = reconnect_data

    with open(config_path, "w") as f:
        yaml.dump(data, f, Dumper=_QuotedDumper, default_flow_style=False, sort_keys=False)
    logger.info("Config saved to %s", path)


class _QuotedDumper(yaml.Dumper):
    """YAML dumper that quotes string values but leaves keys unquoted."""

    def represent_mapping(self, tag: str, mapping: Any, flow_style: Any = None) -> Any:  # noqa: ANN401
        """Override to mark keys so the string representer can skip them."""
        pairs = []
        for key, value in mapping.items():
            key_node = self.represent_data(key)
            key_node.style = None  # Force plain style for keys
            value_node = self.represent_data(value)
            pairs.append((key_node, value_node))
        node = yaml.MappingNode(tag, pairs, flow_style=flow_style)
        return node

    def represent_str(self, data: str) -> Any:  # noqa: ANN401
        return self.represent_scalar("tag:yaml.org,2002:str", data, style='"')


_QuotedDumper.add_representer(str, _QuotedDumper.represent_str)
