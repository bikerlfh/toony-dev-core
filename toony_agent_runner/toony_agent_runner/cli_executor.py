"""Execute Claude via direct CLI invocation (claude -p --stream-json).

Replaces the claude_agent_sdk with asyncio subprocess management.
The CLI in --print mode loads all skills from ~/.claude/skills/ and
~/.agents/skills/, unlike the SDK which strips them.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
import uuid
from typing import Any, AsyncIterator

from .config import ClaudeConfig

logger = logging.getLogger("toony_agent_runner")

# Keys to extract from tool inputs by tool name (keep summary small).
_TOOL_INPUT_KEYS: dict[str, list[str]] = {
    "Read": ["file_path"],
    "Edit": ["file_path", "old_string", "new_string"],
    "Write": ["file_path", "content"],
    "Bash": ["command", "description"],
    "Grep": ["pattern", "path", "glob"],
    "Glob": ["pattern", "path"],
    "WebFetch": ["url"],
    "WebSearch": ["query"],
    "NotebookEdit": ["notebook_path"],
}


def build_claude_command(
    prompt: str,
    config: ClaudeConfig,
    *,
    session_id: str | None = None,
    resume_session_id: str | None = None,
) -> list[str]:
    """Build the CLI command list for claude -p."""
    cmd = [
        "claude", "-p", prompt,
        "--output-format", "stream-json",
        "--verbose",
    ]

    if resume_session_id:
        cmd.extend(["--resume", resume_session_id])
    elif session_id:
        cmd.extend(["--session-id", session_id])

    cmd.extend(["--permission-mode", config.permission_mode])

    if config.allowed_tools:
        cmd.extend(["--tools", ",".join(config.allowed_tools)])

    if config.disallowed_tools:
        cmd.extend(["--disallowed-tools", " ".join(config.disallowed_tools)])

    return cmd


def _build_env(config: ClaudeConfig) -> dict[str, str]:
    """Build environment for the subprocess (inherits current, adds auth)."""
    env = os.environ.copy()
    # Remove nested-invocation blockers.
    env.pop("CLAUDECODE", None)
    env.pop("CLAUDE_CODE_ENTRYPOINT", None)

    oauth_token = (
        config.oauth_token or os.environ.get("CLAUDE_CODE_OAUTH_TOKEN", "")
    ).strip().strip("\"'")
    if oauth_token:
        env["CLAUDE_CODE_OAUTH_TOKEN"] = oauth_token

    return env


def parse_stream_event(raw: dict[str, Any]) -> dict[str, Any]:
    """Parse a raw stream-json event. Pass-through with type normalization."""
    return raw


def extract_question_from_assistant(event: dict[str, Any]) -> dict[str, Any] | None:
    """Extract AskUserQuestion data from an assistant event.

    Handles two input formats:
    - Structured: {"questions": [{"question": "...", "header": "...", "options": [...], "multiSelect": bool}]}
    - Simple: {"question": "..."}

    Returns dict with text, header, options, multi_select, question_id, tool_use_id — or None.
    """
    if event.get("type") != "assistant":
        return None

    message = event.get("message", {})
    for block in message.get("content", []):
        if block.get("type") == "tool_use" and block.get("name") == "AskUserQuestion":
            tool_input = block.get("input", {})

            # Structured format: {"questions": [{"question": "...", ...}]}
            questions = tool_input.get("questions")
            if isinstance(questions, list) and questions:
                q = questions[0]
                text = q.get("question", "")
                header = q.get("header")
                options = q.get("options", [])
                multi_select = q.get("multiSelect", False)
            else:
                # Simple format fallback: {"question": "..."}
                text = tool_input.get("question", str(tool_input))
                header = None
                options = []
                multi_select = False

            return {
                "text": text,
                "header": header,
                "options": options,
                "multi_select": multi_select,
                "question_id": str(uuid.uuid4()),
                "tool_use_id": block.get("id", ""),
            }
    return None


def extract_tool_events(event: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract tool_use blocks from an assistant event (excluding AskUserQuestion).

    Returns the full raw input for each tool — no filtering.
    """
    if event.get("type") != "assistant":
        return []

    message = event.get("message", {})
    results = []
    for block in message.get("content", []):
        if block.get("type") != "tool_use":
            continue
        tool_name = block.get("name", "unknown")
        if tool_name == "AskUserQuestion":
            continue

        results.append({
            "tool_name": tool_name,
            "tool_use_id": block.get("id", ""),
            "input": block.get("input", {}),
        })
    return results


def extract_tool_results(event: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract tool_result blocks from an assistant event."""
    if event.get("type") != "assistant":
        return []

    message = event.get("message", {})
    results = []
    for block in message.get("content", []):
        if block.get("type") != "tool_result":
            continue
        results.append({
            "tool_use_id": block.get("tool_use_id", ""),
            "content": block.get("content", ""),
            "is_error": block.get("is_error", False),
        })
    return results


def extract_text_from_assistant(event: dict[str, Any]) -> str | None:
    """Extract concatenated text blocks from an assistant event."""
    if event.get("type") != "assistant":
        return None

    message = event.get("message", {})
    parts = []
    for block in message.get("content", []):
        if block.get("type") == "text" and block.get("text"):
            parts.append(block["text"])
    return "".join(parts) if parts else None


# ---------------------------------------------------------------------------
# TOONY marker protocol
# ---------------------------------------------------------------------------

TOONY_MARKER_RE = re.compile(r"<!--TOONY:(.*?)-->", re.DOTALL)


def extract_toony_marker(text: str) -> tuple[dict[str, Any] | None, str]:
    """Extract a ``<!--TOONY:{...}-->`` marker from text.

    Returns ``(marker_dict, cleaned_text)`` where *marker_dict* is the
    parsed JSON payload (or ``None`` if no valid marker found) and
    *cleaned_text* is the original text with the marker stripped out.
    """
    match = TOONY_MARKER_RE.search(text)
    if not match:
        return None, text

    try:
        payload = json.loads(match.group(1))
    except (json.JSONDecodeError, ValueError):
        return None, text

    if not isinstance(payload, dict) or "action" not in payload:
        return None, text

    cleaned = text[: match.start()] + text[match.end() :]
    return payload, cleaned


def _log_event_summary(event: dict[str, Any]) -> None:
    """Log a concise info-level summary of a CLI stream event."""
    etype = event.get("type", "")
    summary: dict[str, Any] = {"type": etype}

    if etype == "assistant":
        message = event.get("message", {})
        tools = []
        texts = []
        for block in message.get("content", []):
            if block.get("type") == "tool_use":
                name = block.get("name", "unknown")
                inp = block.get("input", {})
                if name == "AskUserQuestion":
                    text = inp.get("question", "")
                    if not text:
                        qs = inp.get("questions")
                        if isinstance(qs, list) and qs:
                            text = qs[0].get("question", "")
                    summary["question"] = text[:100]
                else:
                    keys = _TOOL_INPUT_KEYS.get(name)
                    detail = ""
                    if keys:
                        detail = next(
                            (str(inp[k])[:120] for k in keys if k in inp),
                            "",
                        )
                    tools.append(f"{name}: {detail}" if detail else name)
            elif block.get("type") == "text" and block.get("text"):
                preview = block["text"][:80].replace("\n", " ")
                if len(block["text"]) > 80:
                    preview += "..."
                texts.append(preview)
        if tools:
            summary["tools"] = tools
        if texts:
            summary["text"] = texts

    elif etype == "result":
        usage = event.get("usage", {})
        summary["duration_s"] = round(event.get("duration_ms", 0) / 1000, 1)
        summary["cost_usd"] = event.get("total_cost_usd", 0)
        summary["tokens_in"] = usage.get("input_tokens", 0)
        summary["tokens_out"] = usage.get("output_tokens", 0)
        summary["session_id"] = event.get("session_id", "")
        if event.get("is_error"):
            summary["error"] = (
                event.get("result")
                or "; ".join(event.get("errors", []))
                or "unknown error"
            )[:200]
    else:
        return

    logger.info("Event: %s", json.dumps(summary, ensure_ascii=False))


async def run_claude(
    prompt: str,
    config: ClaudeConfig,
    *,
    cwd: str | None = None,
    session_id: str | None = None,
    resume_session_id: str | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Spawn claude CLI and yield parsed stream events.

    Each yielded dict has at minimum a "type" key.
    The caller is responsible for interpreting event types.
    """
    cmd = build_claude_command(
        prompt, config,
        session_id=session_id,
        resume_session_id=resume_session_id,
    )
    env = _build_env(config)
    work_dir = cwd or config.working_directory

    logger.info("Spawning: %s (cwd=%s)", " ".join(cmd[:5]) + "...", work_dir)

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=work_dir,
        env=env,
        limit=10 * 1024 * 1024,  # 10 MB – Claude tool results can be very large single lines
    )

    try:
        async for raw_line in proc.stdout:
            line = raw_line.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            try:
                event = json.loads(line)
                logger.debug("Event: %s", event)
                _log_event_summary(event)
                yield parse_stream_event(event)
            except json.JSONDecodeError:
                logger.debug("Non-JSON line from CLI: %s", line[:200])
    finally:
        # Ensure process is cleaned up.
        if proc.returncode is None:
            try:
                proc.terminate()
                await asyncio.wait_for(proc.wait(), timeout=5.0)
            except (asyncio.TimeoutError, ProcessLookupError):
                proc.kill()

        rc = proc.returncode
        if rc and rc != 0:
            stderr = ""
            if proc.stderr:
                stderr_bytes = await proc.stderr.read()
                stderr = stderr_bytes.decode("utf-8", errors="replace").strip()
            if stderr:
                logger.warning("CLI exited %d: %s", rc, stderr[:500])


async def cancel_claude(proc: asyncio.subprocess.Process) -> None:
    """Terminate a running claude process gracefully."""
    if proc.returncode is not None:
        return
    try:
        proc.terminate()
        await asyncio.wait_for(proc.wait(), timeout=5.0)
    except (asyncio.TimeoutError, ProcessLookupError):
        proc.kill()


# ---------------------------------------------------------------------------
# Persistent Claude session (stream-json bidirectional I/O)
# ---------------------------------------------------------------------------


class PersistentClaude:
    """Long-lived Claude CLI process using stream-json bidirectional I/O.

    Instead of spawning a new process for each reply (``--resume``), this
    keeps a single ``claude -p --input-format stream-json --output-format
    stream-json`` process alive and sends messages via stdin.

    Benefits over ``--resume``:
    - No process startup overhead per reply (skills, MCP, config loading)
    - Reliable prompt-cache hits (no delay between turns)
    - CLI-managed context compaction as conversation grows
    - No session-file I/O between turns

    Usage::

        pc = PersistentClaude(config, cwd="/project")
        await pc.start()

        async for event in pc.send_message("do something"):
            print(event)

        # Later — same process, no restart:
        async for event in pc.send_message("now fix this"):
            print(event)

        await pc.close()
    """

    #: Default idle timeout in seconds.
    #: Override with ``TOONY_SESSION_IDLE_TIMEOUT`` env var (seconds).
    DEFAULT_IDLE_TIMEOUT = int(os.environ.get("TOONY_SESSION_IDLE_TIMEOUT", "300"))

    def __init__(
        self,
        config: ClaudeConfig,
        *,
        cwd: str | None = None,
        idle_timeout: float | None = None,
        resume_session_id: str | None = None,
    ) -> None:
        self._config = config
        self._cwd = cwd or config.working_directory
        self._proc: asyncio.subprocess.Process | None = None
        self._event_queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
        self._reader_task: asyncio.Task[None] | None = None
        self._session_id: str | None = None
        self._resume_session_id = resume_session_id
        self._alive = False
        self._idle_timeout = (
            idle_timeout if idle_timeout is not None else self.DEFAULT_IDLE_TIMEOUT
        )
        self._last_activity: float = time.monotonic()

    # -- Properties ----------------------------------------------------------

    @property
    def session_id(self) -> str | None:
        return self._session_id

    @property
    def is_alive(self) -> bool:
        return (
            self._alive
            and self._proc is not None
            and self._proc.returncode is None
        )

    @property
    def idle_seconds(self) -> float:
        """Seconds since last activity (message sent or received)."""
        return time.monotonic() - self._last_activity

    @property
    def is_idle(self) -> bool:
        """True if the session has been idle longer than the timeout."""
        return self.idle_seconds >= self._idle_timeout

    # -- Lifecycle -----------------------------------------------------------

    async def start(self) -> None:
        """Spawn the Claude CLI process in persistent stream-json mode."""
        cmd = self._build_command()
        env = _build_env(self._config)

        logger.info("Starting persistent Claude session (cwd=%s)", self._cwd)

        self._proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=self._cwd,
            env=env,
            limit=10 * 1024 * 1024,
        )

        self._alive = True
        self._last_activity = time.monotonic()
        self._reader_task = asyncio.create_task(self._read_stdout())

    async def close(self) -> None:
        """Gracefully terminate the persistent process."""
        self._alive = False

        if self._reader_task and not self._reader_task.done():
            self._reader_task.cancel()
            try:
                await self._reader_task
            except asyncio.CancelledError:
                pass

        if self._proc and self._proc.returncode is None:
            try:
                self._proc.stdin.close()  # type: ignore[union-attr]
            except Exception:
                pass
            try:
                self._proc.terminate()
                await asyncio.wait_for(self._proc.wait(), timeout=5.0)
            except (asyncio.TimeoutError, ProcessLookupError):
                self._proc.kill()

        logger.info(
            "Persistent Claude session closed (session=%s)", self._session_id,
        )

    # -- Messaging -----------------------------------------------------------

    async def send_message(self, content: str) -> AsyncIterator[dict[str, Any]]:
        """Send a user message and yield events until the turn completes.

        Writes a JSON message to stdin and yields parsed events from stdout
        until a ``result`` event is received, signaling end-of-turn.
        """
        if not self.is_alive:
            raise RuntimeError("Persistent Claude process is not alive")

        msg = {
            "type": "user",
            "message": {"role": "user", "content": content},
            "parent_tool_use_id": None,
            "session_id": self._session_id,
        }

        line = json.dumps(msg, ensure_ascii=False) + "\n"
        self._proc.stdin.write(line.encode("utf-8"))  # type: ignore[union-attr]
        await self._proc.stdin.drain()  # type: ignore[union-attr]
        self._last_activity = time.monotonic()

        logger.info(
            "Sent message to persistent session (len=%d, session=%s)",
            len(content), self._session_id,
        )

        while True:
            event = await self._event_queue.get()

            if event is None:
                self._alive = False
                raise RuntimeError("Claude process exited unexpectedly")

            # Capture session_id from any event that carries it.
            if event.get("session_id"):
                self._session_id = str(event["session_id"])

            _log_event_summary(event)
            yield event

            if event.get("type") == "result":
                self._last_activity = time.monotonic()
                break

    # -- Internal ------------------------------------------------------------

    async def _read_stdout(self) -> None:
        """Background: continuously read stdout lines into the event queue."""
        try:
            async for raw_line in self._proc.stdout:  # type: ignore[union-attr]
                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                    await self._event_queue.put(event)
                except json.JSONDecodeError:
                    logger.debug(
                        "Non-JSON line from persistent CLI: %s", line[:200],
                    )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("Persistent stdout reader error: %s", exc)
        finally:
            await self._event_queue.put(None)
            self._alive = False

    def _build_command(self) -> list[str]:
        """Build CLI command for persistent stream-json mode."""
        cmd = [
            "claude", "-p",
            "--input-format", "stream-json",
            "--output-format", "stream-json",
            "--verbose",
        ]

        if self._resume_session_id:
            cmd.extend(["--resume", self._resume_session_id])

        if self._config.permission_mode:
            cmd.extend(["--permission-mode", self._config.permission_mode])

        if self._config.allowed_tools:
            cmd.extend(["--tools", ",".join(self._config.allowed_tools)])

        if self._config.disallowed_tools:
            cmd.extend(
                ["--disallowed-tools", " ".join(self._config.disallowed_tools)],
            )

        return cmd
