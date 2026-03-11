"""
Entry point for the toony-agent-runner daemon.

Usage::

    toony-agent-runner --config config.yml

The daemon connects to the Toony backend via WebSocket, registers itself,
and waits for task assignments.  When a task arrives it spawns the Claude
CLI to execute the prompt, streams events back to the backend, handles
question/answer flows, and reports completion or failure.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import platform
import signal
import sys
from pathlib import Path

from . import __version__
from .config import ClaudeConfig, ReconnectConfig, RunnerConfig, load_config, save_config
from .connection import BackendConnection
from .protocol import (
    QuestionAnswered,
    CommandExecute,
    CommandResultMessage,
    ConfigSync,
    ConfigSyncAckMessage,
    ConfigUpdate,
    ConfigUpdateAckMessage,
    HeartbeatAck,
    HeartbeatMessage,
    RegisterMessage,
    TaskAssign,
    TaskCancel,
    TaskReply,
    parse_server_message,
)
from .workspace import process_config_sync, resolve_project_path
from .commands import execute_command
from .task_executor import execute_task, execute_task_reply

logger = logging.getLogger("toony_agent_runner")

HEARTBEAT_INTERVAL = 30  # seconds


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

async def run(config: RunnerConfig, config_path: str) -> None:
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
    project_map: dict[str, Path] = {}
    workspace_root = Path(config.workspace_root).expanduser().resolve() if config.workspace_root else None

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
        "max_concurrent_tasks": config.claude.max_concurrent_tasks,
        "max_task_timeout": config.claude.max_task_timeout,
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
                # Resolve project-specific working directory.
                task_config = config
                if msg.project_id and workspace_root:
                    task_cwd = resolve_project_path(msg.project_id, project_map)
                    if task_cwd and task_cwd.exists():
                        from copy import copy
                        task_config = copy(config)
                        task_config.claude = copy(config.claude)
                        task_config.claude.working_directory = str(task_cwd)
                        logger.info("Task %s will run in %s", msg.task_id, task_cwd)
                ce = asyncio.Event()
                cancel_events[msg.task_id] = ce
                active_tasks[msg.task_id] = asyncio.create_task(
                    execute_task(
                        msg.task_id, msg.prompt, conn, task_config, ce
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

            elif isinstance(msg, QuestionAnswered):
                _cleanup_finished_tasks()
                logger.info(
                    "Received question.answered for %s (q=%s, session=%s)",
                    msg.task_id,
                    msg.question_id,
                    msg.session_id,
                )

                if not msg.session_id:
                    logger.warning(
                        "No session_id in question.answered for task %s, ignoring",
                        msg.task_id,
                    )
                    continue

                if msg.task_id in active_tasks:
                    logger.warning(
                        "Task %s still active, ignoring question.answered",
                        msg.task_id,
                    )
                    continue

                if len(active_tasks) >= max_tasks:
                    logger.warning(
                        "At capacity [%d/%d slots], ignoring question.answered %s",
                        len(active_tasks), max_tasks, msg.task_id,
                    )
                    continue

                ce = asyncio.Event()
                cancel_events[msg.task_id] = ce
                active_tasks[msg.task_id] = asyncio.create_task(
                    execute_task_reply(
                        msg.task_id,
                        msg.answer,
                        msg.session_id,
                        conn,
                        config,
                        ce,
                        sequence_offset=msg.sequence_offset,
                    )
                )

            elif isinstance(msg, HeartbeatAck):
                logger.debug("Heartbeat acknowledged")

            elif isinstance(msg, CommandExecute):
                logger.info(
                    "Received command.execute: %s (id=%s)",
                    msg.command_key, msg.command_id,
                )
                asyncio.create_task(_handle_command(msg, conn, config))

            elif isinstance(msg, ConfigSync):
                logger.info("Received config.sync with %d organizations", len(msg.organizations))
                if workspace_root:
                    try:
                        project_map = process_config_sync(
                            {"organizations": msg.organizations},
                            workspace_root,
                        )
                        total_projects = sum(
                            len(o.get("projects", []))
                            for o in msg.organizations
                        )
                        await conn.send(
                            ConfigSyncAckMessage(
                                success=True,
                                org_count=len(msg.organizations),
                                project_count=total_projects,
                            ).to_json()
                        )
                        logger.info(
                            "Config sync complete: %d orgs, %d projects",
                            len(msg.organizations), total_projects,
                        )
                    except Exception as exc:
                        logger.error("Config sync failed: %s", exc)
                        await conn.send(
                            ConfigSyncAckMessage(
                                success=False, error=str(exc)
                            ).to_json()
                        )
                else:
                    logger.warning("Received config.sync but workspace_root not configured, skipping")
                    await conn.send(
                        ConfigSyncAckMessage(
                            success=False, error="workspace_root not configured"
                        ).to_json()
                    )

            elif isinstance(msg, ConfigUpdate):
                logger.info("Received config.update: %s", {
                    "max_concurrent_tasks": msg.max_concurrent_tasks,
                    "max_task_timeout": msg.max_task_timeout,
                })
                try:
                    if msg.max_concurrent_tasks is not None:
                        if not (1 <= msg.max_concurrent_tasks <= 100):
                            raise ValueError(f"max_concurrent_tasks must be 1-100, got {msg.max_concurrent_tasks}")
                        config.claude.max_concurrent_tasks = msg.max_concurrent_tasks
                        max_tasks = msg.max_concurrent_tasks

                    if msg.max_task_timeout is not None:
                        if not (60 <= msg.max_task_timeout <= 28800):
                            raise ValueError(f"max_task_timeout must be 60-28800, got {msg.max_task_timeout}")
                        config.claude.max_task_timeout = msg.max_task_timeout

                    save_config(config_path, config)

                    # Re-register with updated metadata.
                    metadata["max_concurrent_tasks"] = config.claude.max_concurrent_tasks
                    metadata["max_task_timeout"] = config.claude.max_task_timeout
                    await conn.send(RegisterMessage(metadata=metadata).to_json())
                    await conn.send(
                        ConfigUpdateAckMessage(
                            success=True,
                            metadata=metadata,
                        ).to_json()
                    )
                    logger.info("Config update applied and saved")
                except Exception as exc:
                    logger.error("Config update failed: %s", exc)
                    await conn.send(
                        ConfigUpdateAckMessage(
                            success=False, error=str(exc)
                        ).to_json()
                    )

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
        asyncio.run(run(config, args.config))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    cli()
