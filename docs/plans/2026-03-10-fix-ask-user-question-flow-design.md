# Fix AskUserQuestion Flow Design

## Problem

4 interconnected bugs in the `toony_agent_runner` AskUserQuestion flow:

1. **Raw dict displayed in UI**: `extract_question_from_assistant()` looks for `tool_input.get("question")` but the actual key is `questions` (array). Falls back to `str(tool_input)` showing the raw dict.
2. **Question appears twice**: `AskUserQuestion` tool gets denied in `-p` mode with `acceptEdits` permission. Claude falls back to plain text with the same question. Runner sends both `question.asked` and `task.event LOG`.
3. **Task completes immediately**: After the tool denial, CLI finishes and emits a `result` event. Runner sends `task.completed`, overwriting `WAITING_FOR_ANSWER` state.
4. **User answer never reaches Claude**: `QuestionAnswered` handler in `main.py` uses a broken Futures mechanism. Nobody creates the Future. It doesn't spawn `execute_task_reply`.

## Solution

### cli_executor.py — Fix question extraction

Parse actual AskUserQuestion input format: `{"questions": [{"question": "...", "header": "...", "options": [...], "multiSelect": false}]}`.

Return structured data:
```python
{
    "question_id": str(uuid4()),
    "tool_use_id": "toolu_...",
    "text": "Veo cambios pendientes...",
    "header": "Contexto",
    "options": [{"label": "Revisar...", "description": "..."}],
    "multi_select": False,
}
```

### protocol.py — Structured QuestionAskedMessage

Change `question_text: str` to `question_data: dict` to carry header, options, multi_select. Serialize directly in `to_json()`.

Add `session_id: str` and `sequence_offset: int` to `QuestionAnswered` dataclass. Update `parse_server_message` accordingly.

Remove `pending_questions` from `connection.py`.

### task_executor.py — Stop stream after question

When `AskUserQuestion` is detected:
1. Send `question.asked` with structured data
2. `return` immediately — don't process remaining events (no text fallback, no task.completed)

Same logic in `execute_task_reply()` for chained questions.

### main.py — Fix QuestionAnswered handler

Replace broken Futures mechanism with `execute_task_reply` spawn (same pattern as `TaskReply` handler):
- Spawn `execute_task_reply(task_id, answer, session_id, ...)`
- `session_id` and `sequence_offset` come from the backend message

### Backend consumers.py — Include session_id in question.answered

In `ToonyAgentConsumer.receive_json()` for `question.answered`:
- Query `AgentTaskQuestion` to get `session_id`
- Query last `TaskEvent` sequence for `sequence_offset`
- Include both in the broadcast to runner

In `question_asked` broadcast to frontend:
- Include structured question data (header, options) so frontend can render rich UI

## Corrected Flow

1. Claude calls `AskUserQuestion` -> runner parses structured data
2. Runner sends `question.asked` (with header/options) -> **returns immediately**
3. Backend saves question, transitions to `WAITING_FOR_ANSWER`, broadcasts to frontend with rich data
4. Frontend renders options as buttons
5. User answers -> backend sends `question.answered` with `session_id` + `sequence_offset`
6. Runner spawns `execute_task_reply` with the answer -> Claude continues via `--resume`
