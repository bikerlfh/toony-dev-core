"""
Protocol definitions for runner <-> backend WebSocket communication.

Outgoing messages (runner -> backend):
    RegisterMessage, HeartbeatMessage, TaskAcceptedMessage,
    TaskEventMessage, QuestionAskedMessage, TaskCompletedMessage,
    TaskFailedMessage, CommandResultMessage, ConfigSyncAckMessage

Incoming messages (backend -> runner):
    TaskAssign, QuestionAnswered, TaskCancel, HeartbeatAck, CommandExecute,
    ConfigSync
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

    def to_json(self) -> dict:
        return {
            "type": "question.asked",
            "task_id": self.task_id,
            "session_id": self.session_id,
            "question_id": self.question_id,
            "question": self.question_data,
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


# ---------------------------------------------------------------------------
# Message parsing
# ---------------------------------------------------------------------------

# Type alias for any incoming message
IncomingMessage = TaskAssign | QuestionAnswered | TaskCancel | TaskReply | HeartbeatAck | CommandExecute | ConfigSync


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
        )

    if msg_type == "task.cancel":
        return TaskCancel(task_id=data["task_id"])

    if msg_type == "task.reply":
        return TaskReply(
            task_id=data["task_id"],
            message=data["message"],
            session_id=data["session_id"],
            sequence_offset=data.get("sequence_offset", 0),
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

    raise ValueError(f"Unknown server message type: {msg_type!r}")
