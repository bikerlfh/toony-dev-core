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
    CommandExecute,
    CommandResultMessage,
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
from .commands import execute_command
from .stream_parser import (
    EVENT_TYPE_ERROR,
    EVENT_TYPE_LOG,
    EVENT_TYPE_TOOL_RESULT,
    EVENT_TYPE_TOOL_USE,
    classify_event,
    extract_event_data,
    extract_session_id,
)

from claude_agent_sdk import (
    ClaudeAgentOptions,
    ClaudeSDKClient,
    HookMatcher,
    PermissionResultAllow,
    ResultMessage,
)
from claude_agent_sdk.types import (
    AssistantMessage,
    HookContext,
    PreToolUseHookInput,
    StreamEvent,
    SyncHookJSONOutput,
    SystemMessage,
    TextBlock,
)

logger = logging.getLogger("toony_agent_runner")

HEARTBEAT_INTERVAL = 30  # seconds


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# SDK helpers
# ---------------------------------------------------------------------------

def _build_sdk_options(
    config: RunnerConfig,
    hook_callback: Any | None = None,
    session_id: str | None = None,
) -> ClaudeAgentOptions:
    """Build ``ClaudeAgentOptions`` from the runner configuration.

    Parameters
    ----------
    config:
        The full runner configuration.
    hook_callback:
        Optional ``PreToolUse`` hook callback for intercepting
        ``AskUserQuestion`` calls.
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

    # Build PreToolUse hooks if a callback is provided.
    hooks = None
    if hook_callback is not None:
        hooks = {
            "PreToolUse": [
                HookMatcher(
                    matcher="AskUserQuestion",
                    hooks=[hook_callback],
                    timeout=float(config.claude.approval_timeout),
                ),
            ],
        }

    opts = ClaudeAgentOptions(
        cwd=config.claude.working_directory,
        allowed_tools=list(config.claude.allowed_tools),
        permission_mode=config.claude.permission_mode,  # type: ignore[arg-type]
        can_use_tool=_auto_approve_tool,
        hooks=hooks,
        resume=session_id,
        env=env,
        include_partial_messages=True,
    )
    return opts


async def _auto_approve_tool(
    tool_name: str,
    tool_input: dict[str, Any],
    ctx: Any,
) -> PermissionResultAllow:
    """Always-allow ``can_use_tool`` callback.

    Its only purpose is to make the SDK set ``--permission-prompt-tool stdio``,
    which enables the bidirectional control protocol required for hook callbacks.
    """
    return PermissionResultAllow()


def _make_pretooluse_hook(
    conn: BackendConnection,
    task_id: str,
    config: RunnerConfig,
):
    """Create a ``PreToolUse`` hook callback for ``AskUserQuestion``.

    Unlike ``can_use_tool``, PreToolUse hooks fire for **all** tool uses
    before execution — regardless of permission mode.  This means the hook
    reliably intercepts ``AskUserQuestion`` even when the CLI auto-approves it
    under ``acceptEdits`` mode.

    The hook:
    1. Sends an ``ApprovalNeededMessage`` to the backend via WebSocket.
    2. Creates an ``asyncio.Future`` stored on ``conn.pending_approval``.
    3. Awaits the future (resolved by the main loop on ``ApprovalResponse``).
    4. Always returns ``permissionDecision: "deny"`` with the user's answer
       as ``permissionDecisionReason``.  We deny because there is no terminal
       for the CLI to render the question — Claude receives the answer via
       the denial reason and continues normally.
    """
    seq_counter = [0]

    async def hook(
        input_data: PreToolUseHookInput,
        tool_use_id: str | None,
        context: HookContext,
    ) -> SyncHookJSONOutput:
        seq_counter[0] += 1
        sequence = seq_counter[0]

        tool_input = input_data.tool_input

        # Build approval data in the format the frontend expects:
        # { question: string, options?: [{label, description}], tool_name: string }
        questions = tool_input.get("questions", [])
        if questions:
            first_q = questions[0]
            approval_data: dict[str, Any] = {
                "question": first_q.get("question", "Approval required"),
                "options": first_q.get("options"),
                "tool_name": "AskUserQuestion",
            }
        else:
            approval_data = {
                "question": str(tool_input) if tool_input else "Approval required",
                "tool_name": "AskUserQuestion",
            }

        await conn.send(
            ApprovalNeededMessage(task_id, approval_data, sequence).to_json()
        )
        logger.info(
            "Approval needed for task %s: AskUserQuestion (seq=%d)",
            task_id, sequence,
        )

        # Guard against concurrent approvals for the same task.
        existing = conn.pending_approvals.get(task_id)
        if existing is not None and not existing.done():
            logger.error(
                "New approval requested (seq=%d) while a previous approval is "
                "still pending for task %s — this is a bug; rejecting",
                sequence, task_id,
            )
            return SyncHookJSONOutput(
                hookSpecificOutput={
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": "Concurrent approval conflict",
                }
            )

        # Create a future for the main message loop to resolve.
        loop = asyncio.get_running_loop()
        future: asyncio.Future[dict[str, Any]] = loop.create_future()
        conn.pending_approvals[task_id] = future

        try:
            response = await asyncio.wait_for(
                future,
                timeout=config.claude.approval_timeout,
            )
        except asyncio.TimeoutError:
            logger.warning(
                "Approval timeout for task %s (seq=%d)", task_id, sequence
            )
            return SyncHookJSONOutput(
                hookSpecificOutput={
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": "Approval timeout",
                }
            )
        finally:
            conn.pending_approvals.pop(task_id, None)

        if response.get("action") == "reject":
            logger.info("Approval rejected for task %s (seq=%d)", task_id, sequence)
            reason = response.get("response") or "Approval rejected by user"
        else:
            reason = response.get("response") or "User approved"

        # Always deny: prevents the CLI from executing AskUserQuestion
        # (headless — no terminal).  Claude receives the user's answer
        # as the denial reason and uses it to continue.
        return SyncHookJSONOutput(
            hookSpecificOutput={
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": reason,
            }
        )

    return hook


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
    hook = _make_pretooluse_hook(conn, task_id, config)
    options = _build_sdk_options(config, hook_callback=hook)

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
                     and etype == "content_block_start"
                     and event.get("content_block", {}).get("name") != "AskUserQuestion")
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
                    if isinstance(block, TextBlock):
                        text_parts.append(block.text)
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
    hook = _make_pretooluse_hook(conn, task_id, config)
    options = _build_sdk_options(
        config, hook_callback=hook, session_id=session_id
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
                     and etype == "content_block_start"
                     and event.get("content_block", {}).get("name") != "AskUserQuestion")
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
                    if isinstance(block, TextBlock):
                        text_parts.append(block.text)
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
# Command execution
# ---------------------------------------------------------------------------

async def _handle_command(
    msg: CommandExecute,
    conn: BackendConnection,
    config: RunnerConfig,
) -> None:
    """Execute a backend command and send the result back."""
    working_dir = Path(config.claude.working_directory).resolve()

    # Inject backend credentials for download_backend.
    if msg.command_key == "download_backend":
        msg.args.setdefault("api_key", config.api_key)
        # Convert ws:// -> http:// for REST downloads.
        backend_http = config.backend_url.replace("ws://", "http://").replace("wss://", "https://")
        msg.args.setdefault("backend_http_url", backend_http)

    logger.info("Executing command: %s (id=%s)", msg.command_key, msg.command_id)
    result = await execute_command(msg.command_key, msg.args, working_dir)
    logger.info(
        "Command %s (id=%s) result: success=%s",
        msg.command_key, msg.command_id, result.success,
    )

    await conn.send(
        CommandResultMessage(
            command_id=msg.command_id,
            success=result.success,
            output=result.output,
            error=result.error,
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
    active_tasks: dict[str, asyncio.Task[None]] = {}
    cancel_events: dict[str, asyncio.Event] = {}
    max_tasks = config.claude.max_concurrent_tasks

    def _cleanup_finished_tasks() -> None:
        finished = [tid for tid, t in active_tasks.items() if t.done()]
        for tid in finished:
            active_tasks.pop(tid, None)
            cancel_events.pop(tid, None)

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
                _cleanup_finished_tasks()

                if msg.task_id in active_tasks:
                    logger.warning(
                        "Duplicate task.assign for %s, ignoring", msg.task_id
                    )
                    continue

                if len(active_tasks) >= max_tasks:
                    logger.warning(
                        "At capacity [%d/%d slots], ignoring task %s",
                        len(active_tasks), max_tasks, msg.task_id,
                    )
                    continue

                logger.info(
                    "Received task assignment: %s (%s) [%d/%d slots]",
                    msg.task_id, msg.title,
                    len(active_tasks) + 1, max_tasks,
                )
                ce = asyncio.Event()
                cancel_events[msg.task_id] = ce
                active_tasks[msg.task_id] = asyncio.create_task(
                    execute_task(
                        msg.task_id, msg.prompt, conn, config, ce
                    )
                )

            elif isinstance(msg, TaskCancel):
                logger.info("Received task.cancel for %s", msg.task_id)
                ce = cancel_events.get(msg.task_id)
                if ce is not None:
                    ce.set()
                else:
                    logger.warning(
                        "No active task found for cancel: %s", msg.task_id
                    )

            elif isinstance(msg, TaskReply):
                _cleanup_finished_tasks()

                if msg.task_id in active_tasks:
                    logger.warning(
                        "Duplicate task.reply for %s, ignoring", msg.task_id
                    )
                    continue

                if len(active_tasks) >= max_tasks:
                    logger.warning(
                        "At capacity [%d/%d slots], ignoring task.reply %s",
                        len(active_tasks), max_tasks, msg.task_id,
                    )
                    continue

                logger.info(
                    "Received task.reply for %s (session: %s) [%d/%d slots]",
                    msg.task_id, msg.session_id,
                    len(active_tasks) + 1, max_tasks,
                )
                ce = asyncio.Event()
                cancel_events[msg.task_id] = ce
                active_tasks[msg.task_id] = asyncio.create_task(
                    execute_task_reply(
                        msg.task_id,
                        msg.message,
                        msg.session_id,
                        conn,
                        config,
                        ce,
                        sequence_offset=msg.sequence_offset,
                    )
                )

            elif isinstance(msg, ApprovalResponse):
                logger.info(
                    "Received approval.response for %s: %s",
                    msg.task_id,
                    msg.action,
                )
                future = conn.pending_approvals.get(msg.task_id)
                if future is not None and not future.done():
                    future.set_result({
                        "action": msg.action,
                        "response": msg.response,
                    })
                else:
                    logger.warning(
                        "No pending approval for task %s", msg.task_id
                    )

            elif isinstance(msg, HeartbeatAck):
                logger.debug("Heartbeat acknowledged")

            elif isinstance(msg, CommandExecute):
                logger.info(
                    "Received command.execute: %s (id=%s)",
                    msg.command_key, msg.command_id,
                )
                asyncio.create_task(_handle_command(msg, conn, config))

    finally:
        # Shutdown: cancel all running tasks.
        logger.info("Shutting down...")
        heartbeat_task.cancel()

        for ce in cancel_events.values():
            ce.set()

        running = [t for t in active_tasks.values() if not t.done()]
        if running:
            logger.info("Waiting for %d active task(s) to finish...", len(running))
            _, pending = await asyncio.wait(running, timeout=10.0)
            for t in pending:
                t.cancel()

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
