# Control Protocol: Tool Approval

## Problem

The runner currently uses `--permission-mode acceptEdits` which auto-approves all tool usage. There's no way for users to review or block tool calls before execution, and no visibility into what Claude is doing before it happens.

## Solution

Implement the Claude CLI control protocol (`control_request` / `control_response`) to intercept tool calls. The runner evaluates configurable rules (allow/deny/ask) per tool, forwards "ask" decisions to the frontend for user approval, and responds to the CLI within a configurable timeout.

## Configuration

```yaml
claude:
  permission_mode: "default"           # enables control protocol
  tool_approval:
    default_action: "ask"              # ask | allow | deny
    timeout: 120                       # seconds, auto-deny if no response
    rules:
      Read: "allow"
      Grep: "allow"
      Glob: "allow"
      WebSearch: "allow"
      WebFetch: "allow"
      LSP: "allow"
      ToolSearch: "allow"
      Edit: "ask"
      Write: "ask"
      Bash: "ask"
      Agent: "ask"
      "Bash(rm *)": "deny"
      "Bash(git push --force*)": "deny"
```

### Rule Evaluation Order

1. Pattern rules: `Bash(rm *)` — glob match on the tool's primary input field
2. Tool name rules: `Bash` — exact match on tool_name
3. `default_action` — fallback

### Primary Input Field by Tool

| Tool | Field matched by pattern |
|------|--------------------------|
| Bash | `command` |
| Edit | `file_path` |
| Write | `file_path` |
| Read | `file_path` |
| Grep | `pattern` |
| Glob | `pattern` |
| WebFetch | `url` |
| WebSearch | `query` |

## Flow

```
Claude wants to use Bash("npm test")
    │
    ▼
CLI emits control_request on stdout
    │
    ▼
Runner detects in PersistentClaude._read_stdout
    │
    ▼
Runner evaluates rules:
  "Bash(rm *)" → no match
  "Bash" → "ask"
    │
    ├── "allow" → send control_response {decision: "allow"} immediately
    ├── "deny"  → send control_response {decision: "deny"} immediately
    └── "ask"   → send tool.approval_request to backend via WS
                    │
                    ▼
                  Backend creates ToolApproval record, broadcasts to frontend
                    │
                    ▼
                  Frontend shows inline card: "Bash: npm test" [Allow] [Deny]
                    │
                    ├── User clicks Allow → tool.approval_response → control_response {allow}
                    ├── User clicks Deny  → tool.approval_response → control_response {deny}
                    └── Timeout (120s)    → auto-deny → control_response {deny}
```

## Changes by Component

### Runner

| File | Change |
|------|--------|
| `config.py` | New `ToolApprovalConfig` dataclass with `default_action`, `timeout`, `rules` |
| `cli_executor.py` | `PersistentClaude`: detect `control_request` in stdout, new `_approval_queue`, `respond_approval()` method to send `control_response` via stdin |
| `task_executor.py` | `_process_events`: handle `control_request` events — evaluate rules, auto-allow/deny or forward to backend, wait with timeout |
| `protocol.py` | New messages: `ToolApprovalRequestMessage` (outgoing), `ToolApprovalResponse` (incoming) |
| `main.py` | Handle `tool.approval_response` from backend, route to pending approval |

### Backend

| File | Change |
|------|--------|
| `models/tool_approval.py` | New `ToolApproval` model: task, request_id, tool_name, input, decision, decided_at, decided_by |
| `consumers.py` | Handle `tool.approval_request` (runner→backend→frontend), `tool.approval_response` (frontend→backend→runner) |

### Frontend

| File | Change |
|------|--------|
| `task-event-item.tsx` | New `TOOL_APPROVAL` case: inline card with tool name, input preview, Allow/Deny buttons |
| `use-toony-agent-websocket.ts` | Handle `tool.approval_request` event, new `sendToolApproval()` sender |
| `types/toony-agents.ts` | New event types for approval flow |

## WebSocket Protocol

| Direction | Type | Payload |
|-----------|------|---------|
| Runner → Backend | `tool.approval_request` | `{task_id, request_id, tool_name, input, timeout}` |
| Backend → Frontend | `tool.approval_request` | same |
| Frontend → Backend | `tool.approval_response` | `{task_id, request_id, decision: "allow"\|"deny"}` |
| Backend → Runner | `tool.approval_response` | same |

## Edge Cases

| Case | Behavior |
|------|----------|
| Timeout without response | auto-deny, log warning |
| User disconnected | timeout → auto-deny |
| Multiple requests in sequence | Queued, shown in order in frontend |
| Runner reconnects during pending | Pending approvals lost, CLI already timed out internally |
| `permission_mode: "acceptEdits"` | Control protocol disabled — all auto-allow (backward compatible) |

## Backward Compatibility

If `permission_mode` stays `"acceptEdits"`, nothing changes. The control protocol only activates with `"default"`. This allows gradual migration.
