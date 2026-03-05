"""
Protocol definitions for runner <-> backend WebSocket communication.

Outgoing messages (runner -> backend):
    RegisterMessage, HeartbeatMessage, TaskAcceptedMessage,
    TaskEventMessage, ApprovalNeededMessage, TaskCompletedMessage,
    TaskFailedMessage, CommandResultMessage

Incoming messages (backend -> runner):
    TaskAssign, ApprovalResponse, TaskCancel, HeartbeatAck, CommandExecute
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
class ApprovalNeededMessage:
    """Signals that Claude is waiting for user approval."""

    task_id: str
    data: dict[str, Any]
    sequence: int

    def to_json(self) -> dict:
        return {
            "type": "approval.needed",
            "task_id": self.task_id,
            "data": self.data,
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


@dataclass
class ApprovalResponse:
    """Backend relays an approval decision from the user."""

    task_id: str
    action: str  # "approve" or "reject"
    response: str | None = None


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


# ---------------------------------------------------------------------------
# Message parsing
# ---------------------------------------------------------------------------

# Type alias for any incoming message
IncomingMessage = TaskAssign | ApprovalResponse | TaskCancel | TaskReply | HeartbeatAck | CommandExecute


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
        )

    if msg_type == "approval.response":
        return ApprovalResponse(
            task_id=data["task_id"],
            action=data["action"],
            response=data.get("response"),
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

    raise ValueError(f"Unknown server message type: {msg_type!r}")
