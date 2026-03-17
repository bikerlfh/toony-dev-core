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
import uuid
from typing import Any, AsyncIterator

from .config import ClaudeConfig

logger = logging.getLogger("toony_agent_runner")

# Keys to extract from tool inputs by tool name (keep summary small).
_TOOL_INPUT_KEYS: dict[str, list[str]] = {
    "Read": ["file_path"],
    "Edit": ["file_path", "old_string", "new_string"],
    "Write": ["file_path"],
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
    """Extract tool_use blocks from an assistant event (excluding AskUserQuestion)."""
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

        raw_input = block.get("input", {})
        keys = _TOOL_INPUT_KEYS.get(tool_name)
        if keys:
            filtered = {k: raw_input[k] for k in keys if k in raw_input}
        else:
            filtered = raw_input

        results.append({"tool_name": tool_name, "input": filtered})
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
