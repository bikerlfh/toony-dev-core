"""
Entry point for the toony-agent-runner daemon.

Usage::

    toony-agent-runner --config config.yml

The daemon connects to the Toony backend via WebSocket, registers itself,
and waits for task assignments.  When a task arrives it spawns a Claude CLI
subprocess, streams events back to the backend, handles approval gates,
and reports completion or failure.
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
from .claude_process import ClaudeProcess
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
    HeartbeatAck,
    parse_server_message,
)
from .stream_parser import (
    classify_event,
    extract_approval_data,
    extract_event_data,
    is_approval_gate,
)

logger = logging.getLogger("toony_agent_runner")

HEARTBEAT_INTERVAL = 30  # seconds


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

@dataclass
class ClaudeConfig:
    binary: str = "claude"
    output_format: str = "stream-json"
    working_directory: str = "."
    max_task_timeout: int = 3600


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
            binary=claude_raw.get("binary", ClaudeConfig.binary),
            output_format=claude_raw.get(
                "output_format", ClaudeConfig.output_format
            ),
            working_directory=claude_raw.get(
                "working_directory", ClaudeConfig.working_directory
            ),
            max_task_timeout=claude_raw.get(
                "max_task_timeout", ClaudeConfig.max_task_timeout
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
# Task execution
# ---------------------------------------------------------------------------

async def execute_task(
    task_id: str,
    prompt: str,
    conn: BackendConnection,
    config: RunnerConfig,
    cancel_event: asyncio.Event,
) -> None:
    """Execute a single task by running Claude and streaming events.

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
    claude = ClaudeProcess(
        binary=config.claude.binary,
        working_dir=config.claude.working_directory,
        output_format=config.claude.output_format,
    )

    try:
        await claude.start(prompt)
    except Exception as exc:
        logger.error("Failed to start Claude process: %s", exc)
        await conn.send(
            TaskFailedMessage(task_id, error=f"Failed to start Claude: {exc}").to_json()
        )
        return

    await conn.send(TaskAcceptedMessage(task_id).to_json())

    sequence = 0
    approval_future: asyncio.Future[dict[str, Any]] | None = None

    try:
        async for event in claude.stream_events():
            # Check for cancellation.
            if cancel_event.is_set():
                logger.info("Task %s cancelled", task_id)
                await claude.cancel()
                return

            sequence += 1

            if is_approval_gate(event):
                data = extract_approval_data(event)
                await conn.send(
                    ApprovalNeededMessage(task_id, data, sequence).to_json()
                )

                # Create a future that the message handler will resolve.
                loop = asyncio.get_running_loop()
                approval_future = loop.create_future()

                # Store on the connection so the message loop can find it.
                conn._pending_approval = approval_future  # type: ignore[attr-defined]

                try:
                    response = await asyncio.wait_for(
                        approval_future,
                        timeout=config.claude.max_task_timeout,
                    )
                except asyncio.TimeoutError:
                    logger.warning(
                        "Approval timeout for task %s, cancelling", task_id
                    )
                    await claude.cancel()
                    await conn.send(
                        TaskFailedMessage(
                            task_id, error="Approval timeout"
                        ).to_json()
                    )
                    return
                finally:
                    conn._pending_approval = None  # type: ignore[attr-defined]

                if response.get("action") == "reject":
                    logger.info("Approval rejected for task %s", task_id)
                    await claude.cancel()
                    await conn.send(
                        TaskFailedMessage(
                            task_id, error="Approval rejected by user"
                        ).to_json()
                    )
                    return

                # Forward the approval response to Claude's stdin.
                stdin_text = response.get("response") or "yes"
                await claude.send_input(stdin_text)
            else:
                event_type = classify_event(event)
                data = extract_event_data(event)
                await conn.send(
                    TaskEventMessage(task_id, event_type, data, sequence).to_json()
                )

    except Exception as exc:
        logger.exception("Error streaming Claude events for task %s", task_id)
        await conn.send(
            TaskFailedMessage(task_id, error=str(exc)).to_json()
        )
        await claude.cancel()
        return

    exit_code = await claude.wait()
    if exit_code == 0:
        await conn.send(
            TaskCompletedMessage(task_id, result="Task completed").to_json()
        )
    else:
        await conn.send(
            TaskFailedMessage(
                task_id, error=f"Claude exited with code {exit_code}"
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

            elif isinstance(msg, ApprovalResponse):
                logger.info(
                    "Received approval.response for %s: %s",
                    msg.task_id,
                    msg.action,
                )
                # Resolve the pending approval future if one exists.
                pending = getattr(conn, "_pending_approval", None)
                if pending is not None and not pending.done():
                    pending.set_result({
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
