"""
Classify and extract data from Claude Agent SDK events.

The SDK emits ``StreamEvent`` (raw API events) and ``AssistantMessage``
(complete turn messages).  This module classifies events for forwarding
to the backend as ``TaskEventMessage`` payloads.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Event type constants
# ---------------------------------------------------------------------------

EVENT_TYPE_LOG = "LOG"
EVENT_TYPE_TOOL_USE = "TOOL_USE"
EVENT_TYPE_TOOL_RESULT = "TOOL_RESULT"
EVENT_TYPE_ERROR = "ERROR"
EVENT_TYPE_STATUS_CHANGE = "STATUS_CHANGE"


# ---------------------------------------------------------------------------
# Event classification (works on StreamEvent.event dicts)
# ---------------------------------------------------------------------------

def classify_event(event: dict) -> str:
    """Classify a raw API streaming event into a TaskEventType string.

    Receives the ``.event`` dict from a ``StreamEvent`` object.
    """
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

    # Message start
    if etype == "message_start":
        return EVENT_TYPE_STATUS_CHANGE

    # Content block events
    if etype == "content_block_start":
        cb = event.get("content_block", {})
        if cb.get("type") == "tool_use":
            return EVENT_TYPE_TOOL_USE
        return EVENT_TYPE_LOG

    if etype == "content_block_delta":
        delta = event.get("delta", {})
        if delta.get("type") == "input_json_delta":
            return EVENT_TYPE_TOOL_USE
        return EVENT_TYPE_LOG

    if etype == "content_block_stop":
        return EVENT_TYPE_LOG

    # Tool result
    if etype == "tool_result":
        return EVENT_TYPE_TOOL_RESULT

    # Message-level updates
    if etype in ("message_delta", "message_stop"):
        return EVENT_TYPE_STATUS_CHANGE

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

    keys = _TOOL_INPUT_KEYS.get(tool_name)
    if keys:
        filtered = {k: raw_input[k] for k in keys if k in raw_input}
    else:
        filtered = raw_input

    return {"tool_name": tool_name, "input": filtered}


def extract_event_data(event: dict) -> dict[str, Any]:
    """Extract relevant data from a raw API streaming event.

    Returns a dict suitable for ``TaskEventMessage.data``.
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

    # Message start
    if etype == "message_start":
        return {"subtype": "message_start"}

    # Content block start
    if etype == "content_block_start":
        cb = event.get("content_block", {})
        if cb.get("type") == "tool_use":
            return _extract_tool_data(cb)
        return {"text": cb.get("text", "")}

    # Content block delta
    if etype == "content_block_delta":
        delta = event.get("delta", {})
        if delta.get("type") == "text_delta":
            return {"text": delta.get("text", "")}
        if delta.get("type") == "input_json_delta":
            return {"partial_json": delta.get("partial_json", "")}
        return {"delta_type": delta.get("type", "")}

    # Content block stop
    if etype == "content_block_stop":
        return {}

    # Tool result
    if etype == "tool_result":
        return {
            "tool_use_id": event.get("tool_use_id", ""),
            "content": str(event.get("content", ""))[:500],
        }

    # Message delta / stop
    if etype in ("message_delta", "message_stop"):
        return {"subtype": etype}

    # Fallback
    return {"raw_type": etype}


# ---------------------------------------------------------------------------
# Session ID extraction
# ---------------------------------------------------------------------------

def extract_session_id(event: dict) -> str | None:
    """Extract session_id from a system/init event."""
    if event.get("type") == "system" and event.get("subtype") == "init":
        sid = event.get("session_id")
        return str(sid) if sid else None
    return None
