# Fix: Extract TOONY markers from assistant events

**Date**: 2026-03-26
**Scope**: `toony_agent_runner/toony_agent_runner/task_executor.py`

## Problem

TOONY markers (`<!--TOONY:{"action":"question",...}-->`) are not triggering question cards in the frontend. The raw marker text leaks as a LOG event instead.

**Root cause**: Claude CLI emits the marker text in `assistant` events (streamed content blocks) before the final `result` event. The current code:

1. `assistant` handler (lines 134-142): extracts text via `extract_text_from_assistant()` and forwards it as-is as a LOG event — **including the raw marker**
2. `result` handler (lines 163-193): calls `extract_toony_marker()` on `event.get("result")` — but the `result` field may not contain the marker, so `QuestionAskedMessage` is never sent

The frontend only renders `<AgentQuestionCard />` for `question.asked` messages, not for LOG text containing markers.

## Fix

Process TOONY markers in the `assistant` event text handler within `_process_events()`:

1. After `extract_text_from_assistant(event)` returns text, call `extract_toony_marker(text)`
2. If marker with `action="question"`:
   - Send `QuestionAskedMessage` (same as current result-event path)
   - Set `question_asked = True` (existing flag — result handler already respects it at line 149)
   - Send LOG with `cleaned_text` only (marker stripped) — skip if empty
3. If marker with `action="finish"`:
   - Set a new `finish_marker_text` variable with `cleaned_text`
   - Send LOG with `cleaned_text` only — skip if empty
   - Result handler uses `finish_marker_text` for the completed message if `result` field lacks the marker
4. If no marker: send LOG as normal (no change)

Keep the existing marker extraction in the `result` handler as a fallback (markers might appear only in the result for some Claude CLI versions).

## Changes

**`task_executor.py` — `_process_events()`**:

```python
# Before (lines 134-142):
text = extract_text_from_assistant(event)
if text:
    sequence += 1
    await conn.send(
        TaskEventMessage(
            task_id, EVENT_TYPE_LOG, {"text": text}, sequence,
        ).to_json()
    )

# After:
text = extract_text_from_assistant(event)
if text:
    marker, cleaned_text = extract_toony_marker(text)

    if marker and marker.get("action") == "question" and not question_asked:
        question_asked = True
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
            "TOONY marker question (assistant) for task %s: %s",
            task_id, marker["text"][:100],
        )
        # Send remaining cleaned text as LOG if non-empty.
        cleaned_text = cleaned_text.strip()
        if cleaned_text:
            sequence += 1
            await conn.send(
                TaskEventMessage(
                    task_id, EVENT_TYPE_LOG, {"text": cleaned_text}, sequence,
                ).to_json()
            )
        continue

    if marker and marker.get("action") == "finish":
        finish_marker_text = cleaned_text.strip()
        cleaned_text = cleaned_text.strip()
        if cleaned_text:
            sequence += 1
            await conn.send(
                TaskEventMessage(
                    task_id, EVENT_TYPE_LOG, {"text": cleaned_text}, sequence,
                ).to_json()
            )
        continue

    # No marker — forward as LOG.
    sequence += 1
    await conn.send(
        TaskEventMessage(
            task_id, EVENT_TYPE_LOG, {"text": text}, sequence,
        ).to_json()
    )
```

**New variable**: Add `finish_marker_text: str | None = None` alongside `question_asked` at the top of `_process_events()`.

**Result handler fallback for finish**: In the result handler, if no marker is found in `result_text` but `finish_marker_text` is set, use it:

```python
# After existing marker check (line 195):
if not marker and finish_marker_text is not None:
    await conn.send(
        TaskCompletedMessage(
            task_id, result=finish_marker_text or "Task completed",
            session_id=session_id,
        ).to_json()
    )
    return session_id, sequence, "finished"
```

## Import needed

`extract_toony_marker` is already imported from `.cli_executor` (line 16). `uuid` is already imported (line 7). No new imports required.

## Not changed

- `cli_executor.py` — no changes needed
- Frontend — no changes needed
- `result` event handler — existing marker extraction stays as fallback
