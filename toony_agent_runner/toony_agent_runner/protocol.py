"""
Protocol definitions for runner <-> backend WebSocket communication.

Outgoing messages (runner -> backend):
    RegisterMessage, HeartbeatMessage, TaskAcceptedMessage,
    TaskEventMessage, QuestionAskedMessage, ToolApprovalRequestMessage,
    TaskCompletedMessage, TaskFailedMessage, CommandResultMessage,
    ConfigSyncAckMessage, RepoCloneResultMessage, FileTreeSyncMessage

Incoming messages (backend -> runner):
    TaskAssign, QuestionAnswered, ToolApprovalResponse, TaskCancel,
    HeartbeatAck, CommandExecute, ConfigSync, ConfigUpdate, FileTreeSyncAck
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


# ---------------------------------------------------------------------------
# Outgoing messages (runner -> backend)
# ---------------------------------------------------------------------------

@dataclass
class RegisterMessage:
    """Sent once after connecting to identify this runner."""

    metadata: dict[str, Any] = field(default_factory=dict)

    def to_json(self) -> dict:
        return {"type": "register", "metadata": self.metadata}


@dataclass
class HeartbeatMessage:
    """Periodic keepalive sent to the backend."""

    def to_json(self) -> dict:
        return {"type": "heartbeat"}


@dataclass
class TaskAcceptedMessage:
    """Acknowledges that the runner has accepted a task."""

    task_id: str

    def to_json(self) -> dict:
        return {"type": "task.accepted", "task_id": self.task_id}


@dataclass
class TaskEventMessage:
    """Streams an individual event from Claude back to the backend."""

    task_id: str
    event_type: str
    data: dict[str, Any]
    sequence: int

    def to_json(self) -> dict:
        return {
            "type": "task.event",
            "task_id": self.task_id,
            "event_type": self.event_type,
            "data": self.data,
            "sequence": self.sequence,
        }


@dataclass
class QuestionAskedMessage:
    """Signals that Claude is asking the user a question."""

    task_id: str
    session_id: str
    question_id: str
    question_data: dict[str, Any]
    sequence: int = 0

    def to_json(self) -> dict:
        return {
            "type": "question.asked",
            "task_id": self.task_id,
            "session_id": self.session_id,
            "question_id": self.question_id,
            "question": self.question_data,
            "sequence": self.sequence,
        }


@dataclass
class ToolApprovalRequestMessage:
    """Runner asks backend to get user approval for a tool call."""

    task_id: str
    request_id: str
    tool_name: str
    tool_input: dict[str, Any]
    session_id: str = ""
    timeout: int = 120
    sequence: int = 0

    def to_json(self) -> dict[str, Any]:
        return {
            "type": "tool.approval.request",
            "task_id": self.task_id,
            "request_id": self.request_id,
            "tool_name": self.tool_name,
            "tool_input": self.tool_input,
            "session_id": self.session_id,
            "timeout": self.timeout,
            "sequence": self.sequence,
        }


@dataclass
class TaskCompletedMessage:
    """Signals successful task completion."""

    task_id: str
    result: str
    session_id: str | None = None

    def to_json(self) -> dict:
        msg = {
            "type": "task.completed",
            "task_id": self.task_id,
            "result": self.result,
        }
        if self.session_id:
            msg["session_id"] = self.session_id
        return msg


@dataclass
class TaskFailedMessage:
    """Signals task failure."""

    task_id: str
    error: str

    def to_json(self) -> dict:
        return {
            "type": "task.failed",
            "task_id": self.task_id,
            "error": self.error,
        }


# ---------------------------------------------------------------------------
# Incoming messages (backend -> runner)
# ---------------------------------------------------------------------------

@dataclass
class TaskAssign:
    """Backend assigns a task to this runner."""

    task_id: str
    title: str
    prompt: str
    project_id: str | None = None


@dataclass
class QuestionAnswered:
    """Backend relays a user's answer to a question."""

    task_id: str
    question_id: str
    answer: str
    session_id: str = ""
    sequence_offset: int = 0
    project_id: str | None = None


@dataclass
class ToolApprovalResponse:
    """User's approval/denial decision from the frontend."""

    task_id: str
    request_id: str
    decision: str  # "allow" or "deny"
    project_id: str | None = None


@dataclass
class TaskCancel:
    """Backend requests cancellation of a running task."""

    task_id: str


@dataclass
class TaskReply:
    """Backend relays a user reply to continue a completed conversation."""

    task_id: str
    message: str
    session_id: str
    sequence_offset: int = 0
    project_id: str | None = None


@dataclass
class HeartbeatAck:
    """Backend acknowledges a heartbeat."""

    pass


@dataclass
class CommandExecute:
    """Backend sends a command for the runner to execute directly."""

    command_id: str
    command_key: str
    args: dict[str, Any] = field(default_factory=dict)


@dataclass
class ConfigSync:
    """Backend sends workspace configuration for local provisioning."""

    organizations: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class ConfigUpdate:
    """Backend relays a config update from the frontend."""
    max_concurrent_tasks: int | None = None
    max_task_timeout: int | None = None


@dataclass
class FileTreeSyncAck:
    """Backend acknowledges file tree sync."""
    project_id: str


@dataclass
class CommandResultMessage:
    """Runner reports the result of a command execution."""

    command_id: str
    success: bool
    output: str = ""
    error: str = ""

    def to_json(self) -> dict:
        return {
            "type": "command.result",
            "command_id": self.command_id,
            "success": self.success,
            "output": self.output,
            "error": self.error,
        }


@dataclass
class ConfigSyncAckMessage:
    """Acknowledges a config sync from the backend."""

    success: bool
    org_count: int = 0
    project_count: int = 0
    error: str = ""

    def to_json(self) -> dict:
        return {
            "type": "config.sync.ack",
            "success": self.success,
            "org_count": self.org_count,
            "project_count": self.project_count,
            "error": self.error,
        }


@dataclass
class RepoCloneResultMessage:
    """Reports the result of cloning a project repository."""

    project_id: str
    organization_id: str
    status: str  # "success" | "error"
    repository_url: str
    branch: str = ""
    clone_duration_ms: int = 0
    error: str = ""

    def to_json(self) -> dict:
        msg: dict[str, Any] = {
            "type": "repo.clone.result",
            "project_id": self.project_id,
            "organization_id": self.organization_id,
            "status": self.status,
            "repository_url": self.repository_url,
        }
        if self.status == "success":
            msg["branch"] = self.branch
            msg["clone_duration_ms"] = self.clone_duration_ms
        else:
            msg["error"] = self.error
        return msg


@dataclass
class FileTreeSyncMessage:
    """Sends the project's file tree to the backend for caching."""

    project_id: str
    branch: str
    tree: list[str]

    def to_json(self) -> dict:
        return {
            "type": "file_tree.sync",
            "project_id": self.project_id,
            "branch": self.branch,
            "tree": self.tree,
        }


@dataclass
class ConfigUpdateAckMessage:
    """Acknowledges a config update from the frontend."""
    success: bool
    metadata: dict[str, Any] = field(default_factory=dict)
    error: str = ""

    def to_json(self) -> dict:
        return {
            "type": "config.update.ack",
            "success": self.success,
            "metadata": self.metadata,
            "error": self.error,
        }


# ---------------------------------------------------------------------------
# Message parsing
# ---------------------------------------------------------------------------

# Type alias for any incoming message
IncomingMessage = TaskAssign | QuestionAnswered | ToolApprovalResponse | TaskCancel | TaskReply | HeartbeatAck | CommandExecute | ConfigSync | ConfigUpdate | FileTreeSyncAck


def parse_server_message(data: dict) -> IncomingMessage:
    """Parse a raw JSON dict from the backend into a typed message object.

    Raises ValueError for unknown or malformed message types.
    """
    msg_type = data.get("type")

    if msg_type == "task.assign":
        return TaskAssign(
            task_id=data["task_id"],
            title=data.get("title", ""),
            prompt=data["prompt"],
            project_id=data.get("project_id"),
        )

    if msg_type == "question.answered":
        return QuestionAnswered(
            task_id=data["task_id"],
            question_id=data["question_id"],
            answer=data.get("answer", ""),
            session_id=data.get("session_id", ""),
            sequence_offset=data.get("sequence_offset", 0),
            project_id=data.get("project_id"),
        )

    if msg_type == "tool.approval.response":
        return ToolApprovalResponse(
            task_id=data.get("task_id", ""),
            request_id=data.get("request_id", ""),
            decision=data.get("decision", "deny"),
            project_id=data.get("project_id"),
        )

    if msg_type == "task.cancel":
        return TaskCancel(task_id=data["task_id"])

    if msg_type == "task.reply":
        return TaskReply(
            task_id=data["task_id"],
            message=data["message"],
            session_id=data["session_id"],
            sequence_offset=data.get("sequence_offset", 0),
            project_id=data.get("project_id"),
        )

    if msg_type == "heartbeat.ack":
        return HeartbeatAck()

    if msg_type == "command.execute":
        return CommandExecute(
            command_id=data["command_id"],
            command_key=data["command_key"],
            args=data.get("args", {}),
        )

    if msg_type == "config.sync":
        return ConfigSync(organizations=data.get("organizations", []))

    if msg_type == "config.update":
        return ConfigUpdate(
            max_concurrent_tasks=data.get("max_concurrent_tasks"),
            max_task_timeout=data.get("max_task_timeout"),
        )

    if msg_type == "file_tree.sync.ack":
        return FileTreeSyncAck(project_id=data.get("project_id", ""))

    raise ValueError(f"Unknown server message type: {msg_type!r}")
