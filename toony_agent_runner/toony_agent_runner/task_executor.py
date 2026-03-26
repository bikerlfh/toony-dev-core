"""Task execution via Claude CLI — persistent sessions with --resume fallback."""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any

from .cli_executor import (
    PersistentClaude,
    extract_question_from_assistant,
    extract_text_from_assistant,
    extract_tool_events,
    extract_toony_marker,
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


# ---------------------------------------------------------------------------
# Shared event-processing helpers
# ---------------------------------------------------------------------------


def _build_question_data(question: dict[str, Any]) -> dict[str, Any]:
    """Build structured question payload for the backend."""
    q_data: dict[str, Any] = {"text": question["text"]}
    if question.get("options"):
        q_data["type"] = "options"
        q_data["options"] = question["options"]
        q_data["multi_select"] = question.get("multi_select", False)
    else:
        q_data["type"] = "free_text"
    if question.get("header"):
        q_data["header"] = question["header"]
    return q_data


async def _process_events(
    events: Any,  # AsyncIterator[dict]
    task_id: str,
    conn: BackendConnection,
    cancel_event: asyncio.Event,
    sequence: int = 0,
    session_id: str | None = None,
) -> tuple[str | None, int, str]:
    """Consume events from an async iterator and forward to the backend.

    Returns ``(session_id, sequence, outcome)`` where outcome is one of:
    ``"completed"``, ``"failed"``, ``"question"``, ``"cancelled"``.
    """
    question_asked = False

    async for event in events:
        if cancel_event.is_set():
            logger.info("Task %s cancelled", task_id)
            await conn.send(
                TaskFailedMessage(task_id, error="Task cancelled by user").to_json()
            )
            return session_id, sequence, "cancelled"

        etype = event.get("type", "")

        # Capture session_id from any event.
        if event.get("session_id"):
            session_id = str(event["session_id"])

        if etype == "system":
            continue

        if etype == "assistant":
            # Check for AskUserQuestion.
            question = extract_question_from_assistant(event)
            if question and not question_asked:
                question_asked = True
                sequence += 1
                await conn.send(
                    QuestionAskedMessage(
                        task_id=task_id,
                        session_id=session_id or "",
                        question_id=question["question_id"],
                        question_data=_build_question_data(question),
                        sequence=sequence,
                    ).to_json()
                )
                logger.info(
                    "Question asked for task %s: %s",
                    task_id, question["text"][:100],
                )
                # Don't return — drain remaining events until result so
                # the persistent process stays in a clean state.
                continue

            # After a question was asked, skip forwarding denial/fallback.
            if question_asked:
                continue

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

            # If a question was asked via AskUserQuestion tool, don't send completed.
            if question_asked:
                return session_id, sequence, "question"

            if event.get("is_error"):
                error_msg = (
                    event.get("result")
                    or "; ".join(event.get("errors", []))
                    or "Claude CLI error"
                )
                await conn.send(
                    TaskFailedMessage(task_id, error=error_msg).to_json()
                )
                return session_id, sequence, "failed"

            result_text = event.get("result", "Task completed")

            # Check for TOONY marker in result text.
            marker, cleaned_text = extract_toony_marker(result_text)

            if marker and marker.get("action") == "question":
                q_data: dict[str, Any] = {"text": marker["text"]}
                q_type = marker.get("type", "free_text")
                q_data["type"] = q_type
                if marker.get("options"):
                    q_data["options"] = marker["options"]
                if marker.get("multi_select"):
                    q_data["multi_select"] = marker["multi_select"]
                if marker.get("header"):
                    q_data["header"] = marker["header"]

                sequence += 1
                await conn.send(
                    QuestionAskedMessage(
                        task_id=task_id,
                        session_id=session_id or "",
                        question_id=str(uuid.uuid4()),
                        question_data=q_data,
                        sequence=sequence,
                    ).to_json()
                )
                logger.info(
                    "TOONY marker question for task %s: %s",
                    task_id, marker["text"][:100],
                )
                return session_id, sequence, "question"

            if marker and marker.get("action") == "finish":
                await conn.send(
                    TaskCompletedMessage(
                        task_id, result=cleaned_text.strip() or "Task completed",
                        session_id=session_id,
                    ).to_json()
                )
                return session_id, sequence, "finished"

            # No marker — default completion.
            await conn.send(
                TaskCompletedMessage(
                    task_id, result=result_text, session_id=session_id,
                ).to_json()
            )
            return session_id, sequence, "completed"

        # Skip rate_limit_event and other unknown types.

    # Exited without a result event.
    if not question_asked:
        await conn.send(
            TaskCompletedMessage(
                task_id, result="Task completed", session_id=session_id,
            ).to_json()
        )
    return session_id, sequence, "completed"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def execute_task(
    task_id: str,
    prompt: str,
    conn: BackendConnection,
    config: RunnerConfig,
    cancel_event: asyncio.Event,
    session_pool: dict[str, PersistentClaude] | None = None,
) -> None:
    """Execute a task using a persistent Claude session.

    Creates a new ``PersistentClaude`` process, sends the prompt, and streams
    events back to the backend.  On completion the session is stored in
    *session_pool* so that subsequent replies reuse the same process.
    """
    await conn.send(TaskAcceptedMessage(task_id).to_json())

    pc = PersistentClaude(config.claude, cwd=config.claude.working_directory)

    try:
        await pc.start()
    except Exception as exc:
        logger.exception("Failed to start persistent Claude for task %s: %s", task_id, exc)
        await conn.send(
            TaskFailedMessage(task_id, error=f"Failed to start Claude: {exc}").to_json()
        )
        return

    try:
        session_id, _seq, outcome = await _process_events(
            pc.send_message(prompt),
            task_id, conn, cancel_event,
        )

        # Store session for future replies/answers — unless task is finished.
        if outcome == "finished":
            await pc.close()
            if session_pool is not None and session_id:
                session_pool.pop(session_id, None)
            logger.info("Closed persistent session %s (task finished)", session_id)
        elif session_pool is not None and session_id and pc.is_alive:
            session_pool[session_id] = pc
            logger.info(
                "Stored persistent session %s (outcome=%s)", session_id, outcome,
            )
        elif not pc.is_alive:
            await pc.close()

    except asyncio.CancelledError:
        logger.info("Task %s async-cancelled", task_id)
        await pc.close()
        await conn.send(
            TaskFailedMessage(task_id, error="Task cancelled").to_json()
        )

    except Exception as exc:
        logger.exception("Task %s failed: %s", task_id, exc)
        await pc.close()
        await conn.send(
            TaskFailedMessage(task_id, error=str(exc)).to_json()
        )


async def execute_task_reply(
    task_id: str,
    message: str,
    session_id: str,
    conn: BackendConnection,
    config: RunnerConfig,
    cancel_event: asyncio.Event,
    session_pool: dict[str, PersistentClaude] | None = None,
    sequence_offset: int = 0,
) -> None:
    """Resume a task conversation.

    Prefers an existing persistent session from *session_pool*.  Falls back
    to the legacy ``--resume`` approach (new process) when no persistent
    session is available.
    """
    pc = session_pool.get(session_id) if session_pool else None

    if pc and pc.is_alive:
        # ── Persistent session path ──────────────────────────────────────
        logger.info(
            "Reusing persistent session %s for task %s", session_id, task_id,
        )
        try:
            new_sid, _seq, outcome = await _process_events(
                pc.send_message(message),
                task_id, conn, cancel_event,
                sequence=sequence_offset,
                session_id=session_id,
            )

            # Update pool if session_id changed.
            if session_pool is not None and new_sid and new_sid != session_id:
                session_pool.pop(session_id, None)
                session_pool[new_sid] = pc

            if outcome == "finished":
                await pc.close()
                if session_pool is not None:
                    session_pool.pop(session_id, None)
                    session_pool.pop(new_sid or "", None)
                logger.info("Closed persistent session %s (task finished)", session_id)
            elif outcome in ("failed", "cancelled") and not pc.is_alive:
                session_pool.pop(session_id, None)
                session_pool.pop(new_sid or "", None)
                await pc.close()

        except asyncio.CancelledError:
            logger.info("Task reply %s async-cancelled", task_id)
            await conn.send(
                TaskFailedMessage(task_id, error="Task cancelled").to_json()
            )

        except Exception as exc:
            logger.exception("Task reply %s failed (persistent): %s", task_id, exc)
            # Persistent session is broken — remove from pool and close.
            session_pool.pop(session_id, None) if session_pool else None
            await pc.close()
            await conn.send(
                TaskFailedMessage(task_id, error=str(exc)).to_json()
            )
        return

    # ── No persistent session: create one with --resume ─────────────────
    logger.info(
        "No persistent session for %s, creating new with --resume", session_id,
    )

    pc = PersistentClaude(
        config.claude,
        cwd=config.claude.working_directory,
        resume_session_id=session_id,
    )

    try:
        await pc.start()
    except Exception as exc:
        logger.exception(
            "Failed to start persistent Claude (resume) for task %s: %s",
            task_id, exc,
        )
        await conn.send(
            TaskFailedMessage(
                task_id, error=f"Failed to start Claude: {exc}",
            ).to_json()
        )
        return

    try:
        new_sid, _seq, outcome = await _process_events(
            pc.send_message(message),
            task_id, conn, cancel_event,
            sequence=sequence_offset,
            session_id=session_id,
        )

        # Store for future replies — unless task is finished.
        final_sid = new_sid or session_id
        if outcome == "finished":
            await pc.close()
            if session_pool is not None:
                session_pool.pop(final_sid, None)
            logger.info("Closed persistent session %s (task finished)", final_sid)
        elif session_pool is not None and final_sid and pc.is_alive:
            session_pool[final_sid] = pc
            logger.info(
                "Stored persistent session %s via --resume (outcome=%s)",
                final_sid, outcome,
            )
        elif not pc.is_alive:
            await pc.close()

    except asyncio.CancelledError:
        logger.info("Task reply %s async-cancelled", task_id)
        await pc.close()
        await conn.send(
            TaskFailedMessage(task_id, error="Task cancelled").to_json()
        )

    except Exception as exc:
        logger.exception("Task reply %s failed: %s", task_id, exc)
        await pc.close()
        await conn.send(
            TaskFailedMessage(task_id, error=str(exc)).to_json()
        )
