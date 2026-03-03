"""
Entry point for the toony-agent-runner daemon.

Usage::

    toony-agent-runner --config config.yml

The daemon connects to the Toony backend via WebSocket, registers itself,
and waits for task assignments.  When a task arrives it uses the Claude
Agent SDK to execute the prompt, streams events back to the backend,
handles approval gates, and reports completion or failure.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import platform
import signal
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from . import __version__
from .connection import BackendConnection
from .protocol import (
    ApprovalNeededMessage,
    ApprovalResponse,
    HeartbeatMessage,
    RegisterMessage,
    TaskAcceptedMessage,
    TaskAssign,
    TaskCancel,
    TaskCompletedMessage,
    TaskEventMessage,
    TaskFailedMessage,
    TaskReply,
    HeartbeatAck,
    parse_server_message,
)
from .stream_parser import (
    EVENT_TYPE_LOG,
    EVENT_TYPE_TOOL_USE,
    classify_event,
    extract_event_data,
    extract_session_id,
)

from claude_agent_sdk import (
    ClaudeAgentOptions,
    ClaudeSDKClient,
    PermissionResultAllow,
    PermissionResultDeny,
    ResultMessage,
    ToolPermissionContext,
)
from claude_agent_sdk.types import AssistantMessage, StreamEvent, SystemMessage

logger = logging.getLogger("toony_agent_runner")

HEARTBEAT_INTERVAL = 30  # seconds


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

_DEFAULT_ALLOWED_TOOLS = [
    "Read", "Edit", "Write", "Bash", "Grep", "Glob",
    "WebFetch", "WebSearch", "NotebookEdit",
    # NOTE: AskUserQuestion is intentionally excluded so that the CLI sends
    # a control_request to the SDK, which triggers our can_use_tool callback
    # and lets us relay the question to the user via WebSocket.
]


@dataclass
class ClaudeConfig:
    working_directory: str = "."
    max_task_timeout: int = 3600
    approval_timeout: int = 600  # 10 minutes
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


# ---------------------------------------------------------------------------
# SDK helpers
# ---------------------------------------------------------------------------

def _build_sdk_options(
    config: RunnerConfig,
    approval_handler: Any | None = None,
    session_id: str | None = None,
) -> ClaudeAgentOptions:
    """Build ``ClaudeAgentOptions`` from the runner configuration.

    Parameters
    ----------
    config:
        The full runner configuration.
    approval_handler:
        Optional ``can_use_tool`` callback for handling approval gates.
    session_id:
        If provided, resume the given session instead of starting fresh.
    """
    # Inject OAuth token into environment if configured.
    # Strip surrounding quotes in case user wrapped the token in quotes.
    oauth_token = (
        config.claude.oauth_token
        or os.environ.get("CLAUDE_CODE_OAUTH_TOKEN", "")
    ).strip().strip("\"'")
    env: dict[str, str] = {}
    if oauth_token:
        env["CLAUDE_CODE_OAUTH_TOKEN"] = oauth_token

    opts = ClaudeAgentOptions(
        cwd=config.claude.working_directory,
        allowed_tools=list(config.claude.allowed_tools),
        permission_mode=config.claude.permission_mode,  # type: ignore[arg-type]
        can_use_tool=approval_handler,
        resume=session_id,
        env=env,
        include_partial_messages=True,
    )
    return opts


def _make_approval_handler(
    conn: BackendConnection,
    task_id: str,
    config: RunnerConfig,
):
    """Create a ``can_use_tool`` callback for the SDK.

    When Claude invokes ``AskUserQuestion``, this handler:
    1. Sends an ``ApprovalNeededMessage`` to the backend via WebSocket.
    2. Creates an ``asyncio.Future`` stored on ``conn.pending_approval``.
    3. Waits for the future to be resolved (by the main message loop when
       an ``ApprovalResponse`` arrives) or for the approval timeout.
    4. Returns ``PermissionResultAllow`` or ``PermissionResultDeny``
       accordingly.

    For all other tools, it returns ``PermissionResultAllow`` immediately.
    """
    # Track the sequence counter across calls via mutable container.
    seq_counter = [0]

    async def handler(
        tool_name: str,
        tool_input: dict[str, Any],
        ctx: ToolPermissionContext,
    ) -> PermissionResultAllow | PermissionResultDeny:
        # Auto-approve everything except AskUserQuestion.
        if tool_name != "AskUserQuestion":
            return PermissionResultAllow()

        seq_counter[0] += 1
        sequence = seq_counter[0]

        # Build approval data in the format the frontend expects:
        # { question: string, options?: [{label, description}], tool_name: string }
        questions = tool_input.get("questions", [])
        if questions:
            first_q = questions[0]
            approval_data: dict[str, Any] = {
                "question": first_q.get("question", "Approval required"),
                "options": first_q.get("options"),
                "tool_name": tool_name,
            }
        else:
            approval_data: dict[str, Any] = {
                "question": str(tool_input) if tool_input else "Approval required",
                "tool_name": tool_name,
            }

        await conn.send(
            ApprovalNeededMessage(task_id, approval_data, sequence).to_json()
        )
        logger.info(
            "Approval needed for task %s: %s (seq=%d)",
            task_id, tool_name, sequence,
        )

        # Guard against concurrent approvals (the SDK serializes tool calls,
        # so this should never happen, but defend against it).
        if conn.pending_approval is not None and not conn.pending_approval.done():
            logger.error(
                "New approval requested (seq=%d) while a previous approval is "
                "still pending — this is a bug; rejecting",
                sequence,
            )
            return PermissionResultDeny(message="Concurrent approval conflict")

        # Create a future for the main message loop to resolve.
        loop = asyncio.get_running_loop()
        future: asyncio.Future[dict[str, Any]] = loop.create_future()
        conn.pending_approval = future

        try:
            response = await asyncio.wait_for(
                future,
                timeout=config.claude.approval_timeout,
            )
        except asyncio.TimeoutError:
            logger.warning(
                "Approval timeout for task %s (seq=%d)", task_id, sequence
            )
            return PermissionResultDeny(message="Approval timeout")
        finally:
            conn.pending_approval = None

        if response.get("action") == "reject":
            logger.info("Approval rejected for task %s (seq=%d)", task_id, sequence)
            reason = response.get("response") or "Approval rejected by user"
            return PermissionResultDeny(message=reason, interrupt=True)

        return PermissionResultAllow()

    return handler


# ---------------------------------------------------------------------------
# Task execution
# ---------------------------------------------------------------------------

async def execute_task(
    task_id: str,
    prompt: str,
    conn: BackendConnection,
    config: RunnerConfig,
    cancel_event: asyncio.Event,
) -> None:
    """Execute a single task using the Claude Agent SDK.

    Parameters
    ----------
    task_id:
        The backend-assigned task ID.
    prompt:
        The prompt to send to Claude.
    conn:
        Active backend connection (may buffer if disconnected).
    config:
        Runner configuration.
    cancel_event:
        Set externally when a ``task.cancel`` arrives.
    """
    approval_handler = _make_approval_handler(conn, task_id, config)
    options = _build_sdk_options(config, approval_handler=approval_handler)

    await conn.send(TaskAcceptedMessage(task_id).to_json())

    client = ClaudeSDKClient(options=options)
    sequence = 0
    session_id: str | None = None

    try:
        # Connect first (no prompt), then send via query().
        # query() handles both string and AsyncIterable prompts natively.
        await client.connect()
        await client.query(prompt)

        async for message in client.receive_messages():
            # Check for cancellation.
            if cancel_event.is_set():
                logger.info("Task %s cancelled, interrupting SDK client", task_id)
                await client.interrupt()
                await conn.send(
                    TaskFailedMessage(
                        task_id, error="Task cancelled by user"
                    ).to_json()
                )
                return

            if isinstance(message, StreamEvent):
                event = message.event

                # Capture session_id from init event.
                sid = extract_session_id(event)
                if sid:
                    session_id = sid
                if not session_id and message.session_id:
                    session_id = message.session_id

                event_type = classify_event(event)
                etype = event.get("type", "")

                # Only forward actionable events to the frontend:
                #  - TOOL_USE from content_block_start (tool name)
                #  - TOOL_RESULT (tool output)
                #  - ERROR
                # Skip LOG (text deltas), STATUS_CHANGE (message_start/
                # delta/stop — just structural noise), and partial
                # TOOL_USE (input JSON fragments).
                should_forward = (
                    (event_type == EVENT_TYPE_TOOL_USE
                     and etype == "content_block_start")
                    or event_type == EVENT_TYPE_TOOL_RESULT
                    or event_type == EVENT_TYPE_ERROR
                )
                if not should_forward:
                    continue

                sequence += 1
                data = extract_event_data(event)
                await conn.send(
                    TaskEventMessage(task_id, event_type, data, sequence).to_json()
                )

            elif isinstance(message, AssistantMessage):
                # Send complete text as a single LOG event (avoids
                # per-delta fragmentation).
                logger.debug(
                    "Task %s: AssistantMessage with %d content blocks: %s",
                    task_id,
                    len(message.content),
                    [type(b).__name__ for b in message.content],
                )
                text_parts = []
                for block in message.content:
                    if getattr(block, "type", "") == "text":
                        text_parts.append(getattr(block, "text", ""))
                if text_parts:
                    sequence += 1
                    await conn.send(
                        TaskEventMessage(
                            task_id, EVENT_TYPE_LOG,
                            {"text": "".join(text_parts)},
                            sequence,
                        ).to_json()
                    )
                else:
                    logger.debug(
                        "Task %s: AssistantMessage had no text blocks", task_id
                    )

            elif isinstance(message, SystemMessage):
                # Capture session_id from system init.
                logger.debug(
                    "Task %s: SystemMessage subtype=%s", task_id, message.subtype
                )
                if message.subtype == "init" and isinstance(message.data, dict):
                    sid = message.data.get("session_id")
                    if sid:
                        session_id = str(sid)

            elif isinstance(message, ResultMessage):
                # Capture session_id from result.
                if message.session_id:
                    session_id = message.session_id

                if message.is_error:
                    error_msg = message.result or f"Claude error: {message.subtype}"
                    await conn.send(
                        TaskFailedMessage(task_id, error=error_msg).to_json()
                    )
                    return

                # Successful completion.
                result_text = message.result or "Task completed"
                await conn.send(
                    TaskCompletedMessage(
                        task_id, result=result_text, session_id=session_id
                    ).to_json()
                )
                return

            else:
                logger.debug(
                    "Task %s: unhandled message type %s",
                    task_id,
                    type(message).__name__,
                )

    except asyncio.CancelledError:
        logger.info("Task %s async-cancelled", task_id)
        try:
            await client.interrupt()
        except Exception:
            pass
        await conn.send(
            TaskFailedMessage(task_id, error="Task cancelled").to_json()
        )
        return

    except Exception as exc:
        error_str = str(exc)
        logger.error("Task %s failed: %s", task_id, error_str)
        logger.exception("Full traceback for task %s", task_id)
        await conn.send(
            TaskFailedMessage(task_id, error=error_str).to_json()
        )
        return

    finally:
        try:
            await client.disconnect()
        except Exception:
            pass

    # If we exit the loop without a ResultMessage, report completion
    # with whatever session_id we captured.
    await conn.send(
        TaskCompletedMessage(
            task_id, result="Task completed", session_id=session_id
        ).to_json()
    )


async def execute_task_reply(
    task_id: str,
    message: str,
    session_id: str,
    conn: BackendConnection,
    config: RunnerConfig,
    cancel_event: asyncio.Event,
    sequence_offset: int = 0,
) -> None:
    """Resume a completed task conversation using the SDK's session resume.

    Similar to ``execute_task()`` but resumes an existing Claude session
    via ``ClaudeAgentOptions(resume=session_id)``.
    """
    approval_handler = _make_approval_handler(conn, task_id, config)
    options = _build_sdk_options(
        config, approval_handler=approval_handler, session_id=session_id
    )

    client = ClaudeSDKClient(options=options)
    sequence = sequence_offset
    new_session_id: str | None = None

    try:
        # Connect first (resume=session_id is set in options), then send reply.
        await client.connect()
        await client.query(message, session_id=session_id)

        async for msg in client.receive_messages():
            if cancel_event.is_set():
                logger.info("Task reply %s cancelled, interrupting", task_id)
                await client.interrupt()
                await conn.send(
                    TaskFailedMessage(
                        task_id, error="Task cancelled by user"
                    ).to_json()
                )
                return

            if isinstance(msg, StreamEvent):
                event = msg.event

                sid = extract_session_id(event)
                if sid:
                    new_session_id = sid
                if not new_session_id and msg.session_id:
                    new_session_id = msg.session_id

                event_type = classify_event(event)
                etype = event.get("type", "")

                should_forward = (
                    (event_type == EVENT_TYPE_TOOL_USE
                     and etype == "content_block_start")
                    or event_type == EVENT_TYPE_TOOL_RESULT
                    or event_type == EVENT_TYPE_ERROR
                )
                if not should_forward:
                    continue

                sequence += 1
                data = extract_event_data(event)
                await conn.send(
                    TaskEventMessage(task_id, event_type, data, sequence).to_json()
                )

            elif isinstance(msg, AssistantMessage):
                text_parts = []
                for block in msg.content:
                    if getattr(block, "type", "") == "text":
                        text_parts.append(getattr(block, "text", ""))
                if text_parts:
                    sequence += 1
                    await conn.send(
                        TaskEventMessage(
                            task_id, EVENT_TYPE_LOG,
                            {"text": "".join(text_parts)},
                            sequence,
                        ).to_json()
                    )

            elif isinstance(msg, SystemMessage):
                if msg.subtype == "init" and isinstance(msg.data, dict):
                    sid = msg.data.get("session_id")
                    if sid:
                        new_session_id = str(sid)

            elif isinstance(msg, ResultMessage):
                if msg.session_id:
                    new_session_id = msg.session_id

                final_sid = new_session_id or session_id

                if msg.is_error:
                    error_msg = msg.result or f"Claude error: {msg.subtype}"
                    await conn.send(
                        TaskFailedMessage(task_id, error=error_msg).to_json()
                    )
                    return

                result_text = msg.result or "Task completed"
                await conn.send(
                    TaskCompletedMessage(
                        task_id, result=result_text, session_id=final_sid
                    ).to_json()
                )
                return

    except asyncio.CancelledError:
        logger.info("Task reply %s async-cancelled", task_id)
        try:
            await client.interrupt()
        except Exception:
            pass
        await conn.send(
            TaskFailedMessage(task_id, error="Task cancelled").to_json()
        )
        return

    except Exception as exc:
        logger.exception("Error executing task reply %s via SDK", task_id)
        await conn.send(
            TaskFailedMessage(task_id, error=str(exc)).to_json()
        )
        return

    finally:
        try:
            await client.disconnect()
        except Exception:
            pass

    # If we exit the loop without a ResultMessage, report completion.
    final_sid = new_session_id or session_id
    await conn.send(
        TaskCompletedMessage(
            task_id, result="Task completed", session_id=final_sid
        ).to_json()
    )


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

async def run(config: RunnerConfig) -> None:
    """Main daemon loop."""
    conn = BackendConnection(
        url=config.backend_url,
        api_key=config.api_key,
        backoff_base=config.reconnect.backoff_base,
        backoff_max=config.reconnect.backoff_max,
        max_retries=config.reconnect.max_retries,
    )

    # Graceful shutdown handling.
    shutdown_event = asyncio.Event()
    current_task: asyncio.Task[None] | None = None
    cancel_event = asyncio.Event()

    loop = asyncio.get_running_loop()

    def _handle_signal() -> None:
        logger.info("Received shutdown signal")
        shutdown_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _handle_signal)

    # Connect.
    try:
        await conn.connect()
    except Exception as exc:
        logger.error("Initial connection failed: %s", exc)
        await conn.reconnect()

    # Register.
    metadata = {
        "hostname": platform.node(),
        "platform": platform.platform(),
        "runner_version": __version__,
        "pid": os.getpid(),
    }
    await conn.send(RegisterMessage(metadata=metadata).to_json())
    logger.info("Registered with backend: %s", metadata)

    # Main message loop.
    heartbeat_task = asyncio.create_task(_heartbeat_loop(conn, shutdown_event))

    try:
        while not shutdown_event.is_set():
            try:
                raw = await asyncio.wait_for(conn.receive(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
            except ConnectionError:
                if shutdown_event.is_set():
                    break
                logger.warning("Connection lost, attempting reconnect...")
                try:
                    await conn.reconnect()
                    # Re-register after reconnect.
                    await conn.send(RegisterMessage(metadata=metadata).to_json())
                except ConnectionError:
                    logger.error("Could not reconnect, shutting down")
                    break
                continue
            except Exception:
                if shutdown_event.is_set():
                    break
                logger.warning("Connection lost, attempting reconnect...")
                try:
                    await conn.reconnect()
                    await conn.send(RegisterMessage(metadata=metadata).to_json())
                except ConnectionError:
                    logger.error("Could not reconnect, shutting down")
                    break
                continue

            # Parse incoming message.
            try:
                msg = parse_server_message(raw)
            except ValueError as exc:
                logger.warning("Unknown message: %s", exc)
                continue

            # Handle message.
            if isinstance(msg, TaskAssign):
                if current_task is not None and not current_task.done():
                    logger.warning(
                        "Received task.assign while already running a task, "
                        "ignoring task %s",
                        msg.task_id,
                    )
                    continue

                logger.info(
                    "Received task assignment: %s (%s)", msg.task_id, msg.title
                )
                cancel_event.clear()
                current_task = asyncio.create_task(
                    execute_task(
                        msg.task_id, msg.prompt, conn, config, cancel_event
                    )
                )

            elif isinstance(msg, TaskCancel):
                logger.info("Received task.cancel for %s", msg.task_id)
                cancel_event.set()

            elif isinstance(msg, TaskReply):
                if current_task is not None and not current_task.done():
                    logger.warning(
                        "Received task.reply while busy, ignoring"
                    )
                    continue

                logger.info(
                    "Received task.reply for %s (session: %s)",
                    msg.task_id,
                    msg.session_id,
                )
                cancel_event.clear()
                current_task = asyncio.create_task(
                    execute_task_reply(
                        msg.task_id,
                        msg.message,
                        msg.session_id,
                        conn,
                        config,
                        cancel_event,
                        sequence_offset=msg.sequence_offset,
                    )
                )

            elif isinstance(msg, ApprovalResponse):
                logger.info(
                    "Received approval.response for %s: %s",
                    msg.task_id,
                    msg.action,
                )
                # Resolve the pending approval future if one exists.
                if conn.pending_approval is not None and not conn.pending_approval.done():
                    conn.pending_approval.set_result({
                        "action": msg.action,
                        "response": msg.response,
                    })

            elif isinstance(msg, HeartbeatAck):
                logger.debug("Heartbeat acknowledged")

    finally:
        # Shutdown: cancel any running task.
        logger.info("Shutting down...")
        heartbeat_task.cancel()

        if current_task is not None and not current_task.done():
            cancel_event.set()
            try:
                await asyncio.wait_for(current_task, timeout=10.0)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                current_task.cancel()

        await conn.close()
        logger.info("Shutdown complete")


async def _heartbeat_loop(
    conn: BackendConnection, shutdown: asyncio.Event
) -> None:
    """Send heartbeats at a fixed interval until shutdown."""
    while not shutdown.is_set():
        try:
            await asyncio.wait_for(
                shutdown.wait(), timeout=HEARTBEAT_INTERVAL
            )
            # shutdown was set, stop sending heartbeats.
            return
        except asyncio.TimeoutError:
            pass

        await conn.send(HeartbeatMessage().to_json())
        logger.debug("Heartbeat sent")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def cli() -> None:
    """Parse arguments and run the daemon."""
    parser = argparse.ArgumentParser(
        description="Toony Agent Runner — connects Claude to the Toony backend",
    )
    parser.add_argument(
        "--config",
        default="config.yml",
        help="Path to YAML config file (default: config.yml)",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Enable debug logging",
    )
    args = parser.parse_args()

    # Configure logging.
    level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    config = load_config(args.config)

    if not config.api_key:
        logger.error("api_key is required in config")
        sys.exit(1)

    try:
        asyncio.run(run(config))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    cli()
