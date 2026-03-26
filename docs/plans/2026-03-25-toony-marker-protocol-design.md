# TOONY Marker Protocol

## Problem

With persistent Claude CLI sessions (`--input-format stream-json`), Claude no longer uses the `AskUserQuestion` tool to ask questions. Instead, questions appear as plain text in `task.completed` responses. This means:

1. The frontend's rich question UI (`AgentQuestionCard` with options, buttons, header) never appears
2. The task status never transitions to `WAITING_FOR_ANSWER` — it goes straight to `COMPLETED`
3. There's no explicit signal from Claude that a task is truly finished vs. paused waiting for input

## Solution

A lightweight in-band signaling protocol using HTML comment markers embedded in Claude's text responses. The runner extracts these markers, removes them from the text, and translates them into the existing backend WebSocket messages (`question.asked`, `task.completed`).

## Marker Format

```
<!--TOONY:{"action":"...", ...}-->
```

- **HTML comment** — invisible if accidentally rendered in the frontend
- **JSON payload** — structured, extensible, easy to parse
- **`action` field** — required, determines how the runner processes the marker
- **Extracted and removed** — the runner strips the marker from the text before forwarding to the backend

### Regex Pattern

```python
TOONY_MARKER_RE = re.compile(r"<!--TOONY:(.*?)-->", re.DOTALL)
```

## Actions

### `question` — Claude needs a response from the user

```json
{
  "action": "question",
  "text": "What framework do you prefer?",
  "type": "options",
  "header": "Project Setup",
  "options": [
    {"label": "React", "description": "Frontend library"},
    {"label": "Vue", "description": "Alternative framework"}
  ],
  "multi_select": false
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `action` | `string` | yes | — | Must be `"question"` |
| `text` | `string` | yes | — | The question text |
| `type` | `string` | no | `"free_text"` | `"free_text"` or `"options"` |
| `header` | `string` | no | — | Optional header displayed above the question |
| `options` | `array` | no | — | List of `{"label": "...", "description": "..."}` objects |
| `multi_select` | `boolean` | no | `false` | Whether multiple options can be selected |

**Runner behavior:**
1. Extract marker from result text, remove it from the forwarded text
2. Send `question.asked` to backend (same format as the old `AskUserQuestion` flow)
3. Task status transitions to `WAITING_FOR_ANSWER`
4. Persistent session stays alive — user's answer is sent to the same process

### `finish` — Claude considers the task complete

```json
{
  "action": "finish",
  "summary": "Implemented the login endpoint with JWT authentication"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `action` | `string` | yes | — | Must be `"finish"` |
| `summary` | `string` | no | — | Brief summary of what was accomplished |

**Runner behavior:**
1. Extract marker from result text, remove it from the forwarded text
2. Send `task.completed` to backend
3. Close the persistent session (process terminates)
4. Session is removed from the session pool

### No marker — implicit pause

When Claude's response contains no `<!--TOONY:...-->` marker:

1. Send `task.completed` to backend (current behavior)
2. Persistent session stays alive in the session pool
3. User can send a reply via `TaskInputBox`
4. Session auto-closes after idle timeout (`TOONY_SESSION_IDLE_TIMEOUT`, default 300s)

## Flow Diagram

```
Claude responds with text
    │
    ▼
Runner receives "result" event
    │
    ▼
Extract <!--TOONY:{...}--> from result text
    │
    ├── action = "question"
    │     ├── Strip marker from text
    │     ├── Send question.asked to backend (text, type, options, header)
    │     ├── Backend sets status = WAITING_FOR_ANSWER
    │     ├── Frontend renders AgentQuestionCard
    │     └── Session stays alive (waiting for answer)
    │
    ├── action = "finish"
    │     ├── Strip marker from text
    │     ├── Send task.completed to backend
    │     ├── Close persistent session
    │     └── Frontend shows "Completed" badge, no reply input
    │
    └── No marker
          ├── Send task.completed to backend (as-is)
          ├── Session stays alive (allows reply)
          └── Frontend shows "Completed" badge + reply input
```

## System Prompt Injection

The runner injects the following instruction via `--append-system-prompt`:

```
When you need to ask the user a question, include a TOONY marker in your response:
<!--TOONY:{"action":"question","text":"your question","type":"free_text"}-->

For multiple choice questions:
<!--TOONY:{"action":"question","text":"your question","type":"options","options":[{"label":"Option A"},{"label":"Option B"}]}-->

When you have fully completed the task, include:
<!--TOONY:{"action":"finish","summary":"brief summary of what was done"}-->

Do NOT include the finish marker if you need more information or the task is incomplete.
```

## Changes by Component

| Component | Change |
|-----------|--------|
| `cli_executor.py` | New `extract_toony_marker(text)` function — regex extraction + JSON parse |
| `task_executor.py` | In `_process_events`, on `result` event: check for marker, dispatch `question.asked` or `task.completed` accordingly |
| `PersistentClaude._build_command` | Add `--append-system-prompt` with marker instructions |
| Backend | No changes — receives the same `question.asked` and `task.completed` messages |
| Frontend | No changes — already renders `AgentQuestionCard` and `WAITING_FOR_ANSWER` |

## Fallback Behavior

If Claude ignores the system prompt and doesn't include a marker:

- Questions appear as plain text in a `COMPLETED` task
- User can respond via the reply input (`TaskInputBox`)
- No breakage — the UI just lacks the rich question card
- The session stays alive for the configured idle timeout

## Extensibility

The `action` field allows adding new signal types without changing the format:

```json
{"action": "progress", "percent": 75, "message": "Running tests..."}
{"action": "warning", "text": "This will delete 3 files"}
```

These can be added incrementally as needed.
