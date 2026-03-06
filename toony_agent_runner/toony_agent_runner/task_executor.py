"""Task execution via the Claude Agent SDK."""

from __future__ import annotations

import asyncio
import logging

from claude_agent_sdk import ClaudeSDKClient, ResultMessage
from claude_agent_sdk.types import (
    AssistantMessage,
    StreamEvent,
    SystemMessage,
    TextBlock,
)

from .config import RunnerConfig
from .connection import BackendConnection
from .protocol import (
    TaskAcceptedMessage,
    TaskCompletedMessage,
    TaskEventMessage,
    TaskFailedMessage,
)
from .sdk_helpers import _build_sdk_options, _make_pretooluse_hook
from .stream_parser import (
    EVENT_TYPE_ERROR,
    EVENT_TYPE_LOG,
    EVENT_TYPE_TOOL_RESULT,
    EVENT_TYPE_TOOL_USE,
    classify_event,
    extract_event_data,
    extract_session_id,
)

logger = logging.getLogger("toony_agent_runner")


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
