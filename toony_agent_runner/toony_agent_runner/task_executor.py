"""Task execution via direct Claude CLI invocation."""

from __future__ import annotations

import asyncio
import logging

from .cli_executor import (
    extract_question_from_assistant,
    extract_text_from_assistant,
    extract_tool_events,
    run_claude,
)
from .config import RunnerConfig
from .connection import BackendConnection
from .protocol import (
    QuestionAskedMessage,
    TaskAcceptedMessage,
    TaskCompletedMessage,
    TaskEventMessage,
    TaskFailedMessage,
)

logger = logging.getLogger("toony_agent_runner")

EVENT_TYPE_LOG = "LOG"
EVENT_TYPE_TOOL_USE = "TOOL_USE"
EVENT_TYPE_ERROR = "ERROR"


async def execute_task(
    task_id: str,
    prompt: str,
    conn: BackendConnection,
    config: RunnerConfig,
    cancel_event: asyncio.Event,
) -> None:
    """Execute a task by spawning claude CLI and streaming events."""
    await conn.send(TaskAcceptedMessage(task_id).to_json())

    sequence = 0
    session_id: str | None = None

    try:
        async for event in run_claude(
            prompt, config.claude, cwd=config.claude.working_directory,
        ):
            if cancel_event.is_set():
                logger.info("Task %s cancelled", task_id)
                await conn.send(
                    TaskFailedMessage(task_id, error="Task cancelled by user").to_json()
                )
                return

            etype = event.get("type", "")

            # Capture session_id from system init or assistant events.
            if event.get("session_id"):
                session_id = str(event["session_id"])

            if etype == "system":
                continue

            if etype == "assistant":
                # Check for AskUserQuestion.
                question = extract_question_from_assistant(event)
                if question:
                    await conn.send(
                        QuestionAskedMessage(
                            task_id=task_id,
                            session_id=session_id or "",
                            question_id=question["question_id"],
                            question_text=question["text"],
                        ).to_json()
                    )
                    logger.info(
                        "Question asked for task %s: %s",
                        task_id, question["text"][:100],
                    )
                    # Don't return here — the CLI will emit a result event
                    # after AskUserQuestion since it's in -p mode.
                    # But we still forward tool events from this message.

                # Forward tool_use events (excluding AskUserQuestion).
                for tool_event in extract_tool_events(event):
                    sequence += 1
                    await conn.send(
                        TaskEventMessage(
                            task_id, EVENT_TYPE_TOOL_USE, tool_event, sequence,
                        ).to_json()
                    )

                # Forward text as LOG.
                text = extract_text_from_assistant(event)
                if text:
                    sequence += 1
                    await conn.send(
                        TaskEventMessage(
                            task_id, EVENT_TYPE_LOG, {"text": text}, sequence,
                        ).to_json()
                    )

            elif etype == "result":
                if event.get("session_id"):
                    session_id = str(event["session_id"])

                if event.get("is_error"):
                    error_msg = event.get("result", "Claude CLI error")
                    await conn.send(
                        TaskFailedMessage(task_id, error=error_msg).to_json()
                    )
                    return

                result_text = event.get("result", "Task completed")
                await conn.send(
                    TaskCompletedMessage(
                        task_id, result=result_text, session_id=session_id,
                    ).to_json()
                )
                return

            # Skip rate_limit_event and other unknown types.

    except asyncio.CancelledError:
        logger.info("Task %s async-cancelled", task_id)
        await conn.send(
            TaskFailedMessage(task_id, error="Task cancelled").to_json()
        )
        return

    except Exception as exc:
        logger.exception("Task %s failed: %s", task_id, exc)
        await conn.send(
            TaskFailedMessage(task_id, error=str(exc)).to_json()
        )
        return

    # If we exit without a result event, report completion.
    await conn.send(
        TaskCompletedMessage(
            task_id, result="Task completed", session_id=session_id,
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
    """Resume a task conversation using --resume."""
    sequence = sequence_offset
    new_session_id: str | None = None

    try:
        async for event in run_claude(
            message, config.claude,
            cwd=config.claude.working_directory,
            resume_session_id=session_id,
        ):
            if cancel_event.is_set():
                logger.info("Task reply %s cancelled", task_id)
                await conn.send(
                    TaskFailedMessage(task_id, error="Task cancelled by user").to_json()
                )
                return

            etype = event.get("type", "")

            if event.get("session_id"):
                new_session_id = str(event["session_id"])

            if etype == "system":
                continue

            if etype == "assistant":
                question = extract_question_from_assistant(event)
                if question:
                    await conn.send(
                        QuestionAskedMessage(
                            task_id=task_id,
                            session_id=new_session_id or session_id,
                            question_id=question["question_id"],
                            question_text=question["text"],
                        ).to_json()
                    )

                for tool_event in extract_tool_events(event):
                    sequence += 1
                    await conn.send(
                        TaskEventMessage(
                            task_id, EVENT_TYPE_TOOL_USE, tool_event, sequence,
                        ).to_json()
                    )

                text = extract_text_from_assistant(event)
                if text:
                    sequence += 1
                    await conn.send(
                        TaskEventMessage(
                            task_id, EVENT_TYPE_LOG, {"text": text}, sequence,
                        ).to_json()
                    )

            elif etype == "result":
                if event.get("session_id"):
                    new_session_id = str(event["session_id"])

                final_sid = new_session_id or session_id

                if event.get("is_error"):
                    error_msg = event.get("result", "Claude CLI error")
                    await conn.send(
                        TaskFailedMessage(task_id, error=error_msg).to_json()
                    )
                    return

                result_text = event.get("result", "Task completed")
                await conn.send(
                    TaskCompletedMessage(
                        task_id, result=result_text, session_id=final_sid,
                    ).to_json()
                )
                return

    except asyncio.CancelledError:
        logger.info("Task reply %s async-cancelled", task_id)
        await conn.send(
            TaskFailedMessage(task_id, error="Task cancelled").to_json()
        )
        return

    except Exception as exc:
        logger.exception("Task reply %s failed: %s", task_id, exc)
        await conn.send(
            TaskFailedMessage(task_id, error=str(exc)).to_json()
        )
        return

    final_sid = new_session_id or session_id
    await conn.send(
        TaskCompletedMessage(
            task_id, result="Task completed", session_id=final_sid,
        ).to_json()
    )
