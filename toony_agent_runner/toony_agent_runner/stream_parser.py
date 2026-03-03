"""
Parse Claude CLI ``--output-format stream-json`` output.

The stream-json format emits one JSON object per line on stdout.  Key event
types produced by the CLI:

    {"type": "system", "subtype": "init", ...}
    {"type": "assistant", "message": {"content": [...]}}
    {"type": "result", "subtype": "success"|"error_max_turns", ...}

Tool-use blocks appear inside ``assistant`` messages as content items with
``"type": "tool_use"``.  The special ``AskUserQuestion`` tool signals an
approval gate that must be relayed to the backend.
"""

from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Line parsing
# ---------------------------------------------------------------------------

def parse_stream_json_line(line: str) -> dict | None:
    """Parse a single line of stream-json output.

    Returns the parsed dict, or ``None`` if the line is empty or not valid
    JSON (e.g. a blank line or non-JSON diagnostic output).
    """
    stripped = line.strip()
    if not stripped:
        return None
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        logger.debug("Ignoring non-JSON line: %s", stripped[:200])
        return None


# ---------------------------------------------------------------------------
# Approval-gate detection
# ---------------------------------------------------------------------------

def _content_blocks(event: dict) -> list[dict]:
    """Return content blocks from an assistant message event."""
    if event.get("type") != "assistant":
        return []
    message = event.get("message") or event.get("content") or {}
    if isinstance(message, dict):
        return message.get("content", [])
    return []


def is_approval_gate(event: dict) -> bool:
    """Return True if *event* represents an ``AskUserQuestion`` tool use.

    Detection covers several shapes the CLI may emit:

    1. ``{"type": "assistant", "message": {"content": [{"type": "tool_use",
       "name": "AskUserQuestion", ...}]}}``
    2. ``{"type": "content_block_start", "content_block": {"type": "tool_use",
       "name": "AskUserQuestion"}}``
    3. ``{"type": "tool_use", "name": "AskUserQuestion", ...}``
    """
    # Shape 1: assistant message with tool_use content blocks
    for block in _content_blocks(event):
        if (
            block.get("type") == "tool_use"
            and block.get("name") == "AskUserQuestion"
        ):
            return True

    # Shape 2: content_block_start
    if event.get("type") == "content_block_start":
        cb = event.get("content_block", {})
        if cb.get("type") == "tool_use" and cb.get("name") == "AskUserQuestion":
            return True

    # Shape 3: top-level tool_use
    if (
        event.get("type") == "tool_use"
        and event.get("name") == "AskUserQuestion"
    ):
        return True

    return False


def extract_approval_data(event: dict) -> dict[str, Any]:
    """Extract question and options from an ``AskUserQuestion`` event.

    Returns ``{"question": str, "options": list[str]}``.
    """
    # Try to find the tool_use input in different shapes.
    input_data: dict = {}

    # Shape 1: assistant message
    for block in _content_blocks(event):
        if (
            block.get("type") == "tool_use"
            and block.get("name") == "AskUserQuestion"
        ):
            input_data = block.get("input", {})
            break

    # Shape 2: content_block_start
    if not input_data and event.get("type") == "content_block_start":
        cb = event.get("content_block", {})
        if cb.get("type") == "tool_use" and cb.get("name") == "AskUserQuestion":
            input_data = cb.get("input", {})

    # Shape 3: top-level tool_use
    if not input_data and event.get("type") == "tool_use":
        input_data = event.get("input", {})

    question = input_data.get("question", input_data.get("text", ""))
    options = input_data.get("options", [])

    return {"question": str(question), "options": list(options)}


# ---------------------------------------------------------------------------
# Event classification
# ---------------------------------------------------------------------------

# Canonical event types forwarded to the backend.
EVENT_TYPE_LOG = "LOG"
EVENT_TYPE_TOOL_USE = "TOOL_USE"
EVENT_TYPE_TOOL_RESULT = "TOOL_RESULT"
EVENT_TYPE_ERROR = "ERROR"
EVENT_TYPE_STATUS_CHANGE = "STATUS_CHANGE"


def classify_event(event: dict) -> str:
    """Classify a stream-json event into a ``TaskEventType`` string."""
    etype = event.get("type", "")

    # System init / status events
    if etype == "system":
        return EVENT_TYPE_STATUS_CHANGE

    # Result events (success or error)
    if etype == "result":
        subtype = event.get("subtype", "")
        if subtype in ("error", "error_max_turns"):
            return EVENT_TYPE_ERROR
        return EVENT_TYPE_STATUS_CHANGE

    # Assistant messages may contain text and/or tool_use blocks
    if etype == "assistant":
        blocks = _content_blocks(event)
        for block in blocks:
            if block.get("type") == "tool_use":
                return EVENT_TYPE_TOOL_USE
        return EVENT_TYPE_LOG

    # Content block events
    if etype == "content_block_start":
        cb = event.get("content_block", {})
        if cb.get("type") == "tool_use":
            return EVENT_TYPE_TOOL_USE
        return EVENT_TYPE_LOG

    if etype == "content_block_delta":
        return EVENT_TYPE_LOG

    # Tool result
    if etype == "tool_result":
        return EVENT_TYPE_TOOL_RESULT

    # Top-level tool_use (less common)
    if etype == "tool_use":
        return EVENT_TYPE_TOOL_USE

    # Fallback
    return EVENT_TYPE_LOG


# ---------------------------------------------------------------------------
# Event data extraction
# ---------------------------------------------------------------------------

# Keys to extract from tool inputs by tool name.
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


def _extract_tool_data(block: dict) -> dict[str, Any]:
    """Extract a summary of a tool_use content block."""
    tool_name = block.get("name", "unknown")
    raw_input = block.get("input", {})

    # Pick only the interesting keys for known tools.
    keys = _TOOL_INPUT_KEYS.get(tool_name)
    if keys:
        filtered = {k: raw_input[k] for k in keys if k in raw_input}
    else:
        filtered = raw_input

    return {"tool_name": tool_name, "input": filtered}


def extract_event_data(event: dict) -> dict[str, Any]:
    """Extract relevant data from a stream-json event for forwarding.

    The returned dict is suitable for inclusion in a ``TaskEventMessage.data``.
    """
    etype = event.get("type", "")

    # System init
    if etype == "system":
        return {
            "subtype": event.get("subtype", ""),
            "session_id": event.get("session_id", ""),
        }

    # Result
    if etype == "result":
        return {
            "subtype": event.get("subtype", ""),
            "result": event.get("result", ""),
        }

    # Assistant message
    if etype == "assistant":
        blocks = _content_blocks(event)
        texts: list[str] = []
        tools: list[dict] = []
        for block in blocks:
            if block.get("type") == "text":
                texts.append(block.get("text", ""))
            elif block.get("type") == "tool_use":
                tools.append(_extract_tool_data(block))

        data: dict[str, Any] = {}
        if texts:
            data["text"] = "\n".join(texts)
        if tools:
            data["tools"] = tools
        return data

    # Content block start
    if etype == "content_block_start":
        cb = event.get("content_block", {})
        if cb.get("type") == "tool_use":
            return _extract_tool_data(cb)
        return {"text": cb.get("text", "")}

    # Content block delta
    if etype == "content_block_delta":
        delta = event.get("delta", {})
        return {"text": delta.get("text", "")}

    # Tool result
    if etype == "tool_result":
        return {
            "tool_use_id": event.get("tool_use_id", ""),
            "content": str(event.get("content", ""))[:500],
        }

    # Top-level tool_use
    if etype == "tool_use":
        return _extract_tool_data(event)

    # Fallback: pass through a minimal representation.
    return {"raw_type": etype}
