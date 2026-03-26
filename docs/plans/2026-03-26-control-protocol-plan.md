# Control Protocol: Tool Approval Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the Claude CLI control protocol so the runner can intercept tool calls, evaluate configurable rules (allow/deny/ask), and forward "ask" decisions to the frontend for user approval via WebSocket.

**Architecture:** `PersistentClaude` detects `control_request` events in stdout and routes them to a separate approval queue. `_process_events` evaluates rules and either auto-responds or sends `tool.approval_request` to the backend. The backend broadcasts to the frontend, which shows an inline approval card. The response flows back through the same chain. Backward compatible — only activates with `permission_mode: "default"`.

**Tech Stack:** Python 3.11+ (asyncio), Django Channels (WebSocket consumers), Next.js 15 / React 19 (frontend), Tailwind CSS v4

---

### Task 1: Add ToolApprovalConfig to config.py

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/config.py`
- Test: `toony_agent_runner/tests/test_tool_approval.py`

**Step 1: Write tests**

Create `toony_agent_runner/tests/test_tool_approval.py`:

```python
"""Tests for tool approval configuration and rule evaluation."""

from __future__ import annotations

import pytest

from toony_agent_runner.config import ClaudeConfig, ToolApprovalConfig, load_config


class TestToolApprovalConfig:

    def test_defaults(self):
        config = ToolApprovalConfig()
        assert config.default_action == "ask"
        assert config.timeout == 120
        assert config.rules == {}

    def test_custom_values(self):
        config = ToolApprovalConfig(
            default_action="allow",
            timeout=60,
            rules={"Read": "allow", "Bash": "ask", "Bash(rm *)": "deny"},
        )
        assert config.default_action == "allow"
        assert config.timeout == 60
        assert config.rules["Bash(rm *)"] == "deny"

    def test_claude_config_includes_tool_approval(self):
        config = ClaudeConfig()
        assert isinstance(config.tool_approval, ToolApprovalConfig)
        assert config.tool_approval.default_action == "ask"
```

**Step 2: Run tests to verify they fail**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_tool_approval.py -v`
Expected: FAIL — `ImportError: cannot import name 'ToolApprovalConfig'`

**Step 3: Implement ToolApprovalConfig**

In `config.py`, add after `_DEFAULT_ALLOWED_TOOLS` (before `ClaudeConfig`):

```python
@dataclass
class ToolApprovalConfig:
    default_action: str = "ask"  # ask | allow | deny
    timeout: int = 120  # seconds, auto-deny if no response
    rules: dict[str, str] = field(default_factory=dict)
```

Add `tool_approval` field to `ClaudeConfig`:

```python
@dataclass
class ClaudeConfig:
    working_directory: str = "."
    max_task_timeout: int = 3600
    approval_timeout: int = 600
    max_concurrent_tasks: int = 1
    oauth_token: str = ""
    permission_mode: str = "acceptEdits"
    allowed_tools: list[str] = field(default_factory=lambda: list(_DEFAULT_ALLOWED_TOOLS))
    disallowed_tools: list[str] = field(default_factory=list)
    tool_approval: ToolApprovalConfig = field(default_factory=ToolApprovalConfig)
```

In `load_config`, add after `disallowed_tools` loading:

```python
            tool_approval_raw = claude_raw.get("tool_approval", {})
            tool_approval = ToolApprovalConfig(
                default_action=tool_approval_raw.get("default_action", "ask"),
                timeout=tool_approval_raw.get("timeout", 120),
                rules=tool_approval_raw.get("rules", {}),
            )
```

And pass `tool_approval=tool_approval` to the `ClaudeConfig(...)` constructor.

In `save_config`, add after `disallowed_tools` saving:

```python
    if config.claude.tool_approval.rules or config.claude.tool_approval.default_action != "ask":
        claude_data["tool_approval"] = {
            "default_action": config.claude.tool_approval.default_action,
            "timeout": config.claude.tool_approval.timeout,
            "rules": config.claude.tool_approval.rules,
        }
```

**Step 4: Run tests**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_tool_approval.py -v`
Expected: 3 PASSED

**Step 5: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/config.py toony_agent_runner/tests/test_tool_approval.py
git commit -m "feat(agent-runner): add ToolApprovalConfig with rules and timeout"
```

---

### Task 2: Add rule evaluation logic

**Files:**
- Create: `toony_agent_runner/toony_agent_runner/tool_approval.py`
- Test: `toony_agent_runner/tests/test_tool_approval.py` (append)

**Step 1: Write tests**

Append to `test_tool_approval.py`:

```python
from toony_agent_runner.tool_approval import evaluate_tool_rule


# Primary input field for pattern matching
_TOOL_PRIMARY_FIELD = {
    "Bash": "command",
    "Edit": "file_path",
    "Write": "file_path",
    "Read": "file_path",
    "Grep": "pattern",
    "Glob": "pattern",
    "WebFetch": "url",
    "WebSearch": "query",
}


class TestEvaluateToolRule:

    def test_exact_tool_match(self):
        rules = {"Bash": "ask", "Read": "allow"}
        assert evaluate_tool_rule("Read", {}, rules, "ask") == "allow"
        assert evaluate_tool_rule("Bash", {}, rules, "ask") == "ask"

    def test_default_action_when_no_rule(self):
        rules = {"Read": "allow"}
        assert evaluate_tool_rule("Edit", {}, rules, "deny") == "deny"

    def test_pattern_rule_matches(self):
        rules = {"Bash(rm *)": "deny", "Bash": "ask"}
        assert evaluate_tool_rule("Bash", {"command": "rm -rf /"}, rules, "ask") == "deny"
        assert evaluate_tool_rule("Bash", {"command": "npm test"}, rules, "ask") == "ask"

    def test_pattern_rule_priority_over_exact(self):
        """Pattern rules are checked before exact name rules."""
        rules = {"Bash(git push --force*)": "deny", "Bash": "allow"}
        assert evaluate_tool_rule("Bash", {"command": "git push --force origin main"}, rules, "ask") == "deny"
        assert evaluate_tool_rule("Bash", {"command": "git status"}, rules, "ask") == "allow"

    def test_file_path_pattern(self):
        rules = {"Edit(~/.claude/skills/*)": "deny", "Edit": "ask"}
        assert evaluate_tool_rule("Edit", {"file_path": "~/.claude/skills/foo/SKILL.md"}, rules, "ask") == "deny"
        assert evaluate_tool_rule("Edit", {"file_path": "src/main.py"}, rules, "ask") == "ask"

    def test_empty_rules_uses_default(self):
        assert evaluate_tool_rule("Bash", {}, {}, "allow") == "allow"

    def test_unknown_tool_uses_default(self):
        rules = {"Read": "allow"}
        assert evaluate_tool_rule("mcp__toony__search", {}, rules, "ask") == "ask"
```

**Step 2: Run tests to verify they fail**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_tool_approval.py::TestEvaluateToolRule -v`
Expected: FAIL — `ImportError: cannot import name 'evaluate_tool_rule'`

**Step 3: Implement**

Create `toony_agent_runner/toony_agent_runner/tool_approval.py`:

```python
"""Tool approval rule evaluation for the control protocol."""

from __future__ import annotations

import fnmatch
import re
from typing import Any

# Maps tool name to the input field used for pattern matching.
_TOOL_PRIMARY_FIELD: dict[str, str] = {
    "Bash": "command",
    "Edit": "file_path",
    "Write": "file_path",
    "Read": "file_path",
    "Grep": "pattern",
    "Glob": "pattern",
    "WebFetch": "url",
    "WebSearch": "query",
}

_PATTERN_RE = re.compile(r"^(\w+)\((.+)\)$")


def evaluate_tool_rule(
    tool_name: str,
    tool_input: dict[str, Any],
    rules: dict[str, str],
    default_action: str,
) -> str:
    """Evaluate tool approval rules and return the action.

    Checks pattern rules first (e.g. ``Bash(rm *)``), then exact name
    rules (e.g. ``Bash``), then falls back to *default_action*.

    Returns ``"allow"``, ``"deny"``, or ``"ask"``.
    """
    # 1. Check pattern rules (most specific).
    primary_field = _TOOL_PRIMARY_FIELD.get(tool_name)
    if primary_field:
        primary_value = str(tool_input.get(primary_field, ""))
        for rule_key, action in rules.items():
            match = _PATTERN_RE.match(rule_key)
            if not match:
                continue
            rule_tool, pattern = match.group(1), match.group(2)
            if rule_tool == tool_name and fnmatch.fnmatch(primary_value, pattern):
                return action

    # 2. Check exact name rule.
    if tool_name in rules:
        return rules[tool_name]

    # 3. Default.
    return default_action
```

**Step 4: Run tests**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_tool_approval.py -v`
Expected: All PASSED

**Step 5: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/tool_approval.py toony_agent_runner/tests/test_tool_approval.py
git commit -m "feat(agent-runner): add tool approval rule evaluation with pattern matching"
```

---

### Task 3: Handle control_request in PersistentClaude

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/cli_executor.py`
- Test: `toony_agent_runner/tests/test_tool_approval.py` (append)

**Step 1: Write tests**

Append to `test_tool_approval.py`:

```python
import asyncio
from toony_agent_runner.cli_executor import PersistentClaude


class TestPersistentClaudeControlRequest:

    def test_build_command_default_permission_mode(self):
        """When permission_mode is 'default', control protocol is active."""
        config = ClaudeConfig(working_directory="/tmp", permission_mode="default")
        pc = PersistentClaude(config)
        cmd = pc._build_command()
        assert "--permission-mode" in cmd
        idx = cmd.index("--permission-mode") + 1
        assert cmd[idx] == "default"
```

**Step 2: Modify PersistentClaude**

In `cli_executor.py`, add a second queue to `PersistentClaude.__init__`:

```python
        self._approval_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
```

In `_read_stdout`, route `control_request` events to the approval queue instead of the event queue:

```python
                try:
                    event = json.loads(line)
                    if event.get("type") == "control_request":
                        await self._approval_queue.put(event)
                    else:
                        await self._event_queue.put(event)
                except json.JSONDecodeError:
```

Add a method to respond to control requests via stdin:

```python
    async def respond_approval(self, request_id: str, decision: str) -> None:
        """Send a control_response to the CLI process."""
        if not self.is_alive:
            return
        msg = {
            "type": "control_response",
            "request_id": request_id,
            "decision": decision,
        }
        line = json.dumps(msg) + "\n"
        self._proc.stdin.write(line.encode("utf-8"))  # type: ignore[union-attr]
        await self._proc.stdin.drain()  # type: ignore[union-attr]
        logger.info(
            "Sent control_response: request_id=%s decision=%s", request_id, decision,
        )
```

Add a property to access the approval queue:

```python
    @property
    def approval_queue(self) -> asyncio.Queue[dict[str, Any]]:
        return self._approval_queue
```

**Step 3: Run tests**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_tool_approval.py -v`
Expected: All PASSED

**Step 4: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/cli_executor.py toony_agent_runner/tests/test_tool_approval.py
git commit -m "feat(agent-runner): handle control_request in PersistentClaude with approval queue"
```

---

### Task 4: Add protocol messages

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/protocol.py`

**Step 1: Add outgoing message**

After `QuestionAskedMessage`, add:

```python
@dataclass
class ToolApprovalRequestMessage:
    """Runner asks backend to get user approval for a tool call."""

    task_id: str
    request_id: str
    tool_name: str
    tool_input: dict[str, Any]
    session_id: str = ""
    timeout: int = 120
    sequence: int = 0

    def to_json(self) -> dict[str, Any]:
        return {
            "type": "tool.approval.request",
            "task_id": self.task_id,
            "request_id": self.request_id,
            "tool_name": self.tool_name,
            "tool_input": self.tool_input,
            "session_id": self.session_id,
            "timeout": self.timeout,
            "sequence": self.sequence,
        }
```

**Step 2: Add incoming message**

After `QuestionAnswered`, add:

```python
@dataclass
class ToolApprovalResponse:
    """User's approval/denial decision from the frontend."""

    task_id: str
    request_id: str
    decision: str  # "allow" or "deny"
    project_id: str | None = None
```

**Step 3: Update parse_server_message**

Add parsing case:

```python
    if msg_type == "tool.approval.response":
        return ToolApprovalResponse(
            task_id=data.get("task_id", ""),
            request_id=data.get("request_id", ""),
            decision=data.get("decision", "deny"),
            project_id=data.get("project_id"),
        )
```

**Step 4: Run existing tests**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_protocol.py -v`
Expected: All PASSED (no breakage)

**Step 5: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/protocol.py
git commit -m "feat(agent-runner): add ToolApprovalRequest/Response protocol messages"
```

---

### Task 5: Approval handling in _process_events and main.py

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/task_executor.py`
- Modify: `toony_agent_runner/toony_agent_runner/main.py`

This is the core integration task. `_process_events` needs to run an approval handler concurrently with event processing.

**Step 1: Add approval handler to task_executor.py**

Add imports:

```python
from .tool_approval import evaluate_tool_rule
from .protocol import ToolApprovalRequestMessage
```

Add a new function that runs alongside `_process_events` to handle approvals from the `PersistentClaude.approval_queue`:

```python
async def _handle_approvals(
    pc: PersistentClaude,
    task_id: str,
    conn: BackendConnection,
    config: RunnerConfig,
    cancel_event: asyncio.Event,
    sequence_holder: list[int],
    session_id_holder: list[str | None],
    pending_approvals: dict[str, asyncio.Future[str]],
) -> None:
    """Background task: process control_request events from the approval queue."""
    approval_config = config.claude.tool_approval

    while not cancel_event.is_set() and pc.is_alive:
        try:
            event = await asyncio.wait_for(pc.approval_queue.get(), timeout=1.0)
        except asyncio.TimeoutError:
            continue

        request = event.get("request", {})
        request_id = str(event.get("request_id", ""))
        tool_name = request.get("tool_name", "")
        tool_input = request.get("input", {})

        # Evaluate rules.
        action = evaluate_tool_rule(
            tool_name, tool_input,
            approval_config.rules, approval_config.default_action,
        )

        if action == "allow":
            await pc.respond_approval(request_id, "allow")
            logger.info("Auto-allowed tool %s for task %s", tool_name, task_id)
            continue

        if action == "deny":
            await pc.respond_approval(request_id, "deny")
            logger.info("Auto-denied tool %s for task %s", tool_name, task_id)
            continue

        # action == "ask" → send to backend and wait for response.
        sequence_holder[0] += 1
        await conn.send(
            ToolApprovalRequestMessage(
                task_id=task_id,
                request_id=request_id,
                tool_name=tool_name,
                tool_input=tool_input,
                session_id=session_id_holder[0] or "",
                timeout=approval_config.timeout,
                sequence=sequence_holder[0],
            ).to_json()
        )
        logger.info(
            "Requesting approval for %s (request=%s, task=%s)",
            tool_name, request_id, task_id,
        )

        # Create a future for this approval.
        loop = asyncio.get_running_loop()
        future: asyncio.Future[str] = loop.create_future()
        pending_approvals[request_id] = future

        try:
            decision = await asyncio.wait_for(future, timeout=approval_config.timeout)
        except asyncio.TimeoutError:
            decision = "deny"
            logger.warning(
                "Approval timeout for %s (request=%s), auto-denying",
                tool_name, request_id,
            )
        finally:
            pending_approvals.pop(request_id, None)

        await pc.respond_approval(request_id, decision)
```

**Step 2: Modify execute_task to run approval handler**

In `execute_task`, when `permission_mode == "default"`, run `_handle_approvals` concurrently with `_process_events`:

```python
    pending_approvals: dict[str, asyncio.Future[str]] = {}
    sequence_holder = [0]
    session_id_holder: list[str | None] = [None]

    try:
        if config.claude.permission_mode == "default":
            approval_task = asyncio.create_task(
                _handle_approvals(
                    pc, task_id, conn, config, cancel_event,
                    sequence_holder, session_id_holder, pending_approvals,
                )
            )

        session_id, _seq, outcome = await _process_events(
            pc.send_message(prompt),
            task_id, conn, cancel_event,
        )
        session_id_holder[0] = session_id

        if config.claude.permission_mode == "default":
            approval_task.cancel()

        # ... rest of session storage logic
```

**Step 3: Add ToolApprovalResponse handling in main.py**

Add import:

```python
from .protocol import ToolApprovalResponse
```

Add handler in the message dispatch loop, after `QuestionAnswered`:

```python
            elif isinstance(msg, ToolApprovalResponse):
                logger.info(
                    "Received tool.approval.response for task %s (request=%s, decision=%s)",
                    msg.task_id, msg.request_id, msg.decision,
                )
                # Resolve the pending approval future.
                # The future is stored per-task, keyed by request_id.
                # We need a way to route this to the right task's pending_approvals dict.
```

For routing: add a shared `pending_approvals` dict at the `run()` level (alongside `session_pool`), keyed by `request_id`:

```python
    pending_approvals: dict[str, asyncio.Future[str]] = {}
```

Pass it to `execute_task` and `execute_task_reply`. The handler resolves the future:

```python
            elif isinstance(msg, ToolApprovalResponse):
                future = pending_approvals.get(msg.request_id)
                if future and not future.done():
                    future.set_result(msg.decision)
                    logger.info(
                        "Resolved approval %s: %s", msg.request_id, msg.decision,
                    )
                else:
                    logger.warning(
                        "No pending approval for request %s", msg.request_id,
                    )
```

**Step 4: Run all runner tests**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/ -v`
Expected: All PASSED

**Step 5: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/task_executor.py toony_agent_runner/toony_agent_runner/main.py
git commit -m "feat(agent-runner): integrate control protocol with rule evaluation and approval routing"
```

---

### Task 6: Backend — consumer handlers

**Files:**
- Modify: `backend/apps/toony_agents/consumers.py`

**Step 1: Add tool.approval.request handler in ToonyAgentRunnerConsumer**

In `receive_json`, after the `question.asked` handler, add:

```python
        elif msg_type == "tool.approval.request":
            task_id = content.get("task_id")
            if not task_id:
                return

            request_id = content.get("request_id", "")
            tool_name = content.get("tool_name", "")
            tool_input = content.get("tool_input", {})
            session_id = content.get("session_id", "")
            timeout = content.get("timeout", 120)
            sequence = content.get("sequence", 0)

            try:
                task = await database_sync_to_async(
                    AgentTask.objects.select_related("toony_agent").get
                )(id=task_id)
            except AgentTask.DoesNotExist:
                logger.warning("tool.approval.request for unknown task %s", task_id)
                return

            if not self.agent or str(task.toony_agent_id) != str(self.agent.id):
                logger.warning("tool.approval.request task %s doesn't belong to agent", task_id)
                return

            # Create task event for the approval request.
            max_seq = await database_sync_to_async(
                lambda: TaskEvent.objects.filter(task=task).aggregate(
                    max_seq=models.Max("sequence")
                )["max_seq"] or 0
            )()
            event_seq = max(max_seq + 1, sequence)

            await database_sync_to_async(TaskEvent.objects.create)(
                task=task,
                event_type="TOOL_APPROVAL",
                data={
                    "request_id": request_id,
                    "tool_name": tool_name,
                    "tool_input": tool_input,
                    "status": "pending",
                    "timeout": timeout,
                },
                sequence=event_seq,
            )

            # Broadcast to frontend.
            await self.channel_layer.group_send(
                f"toony_agent_{self.agent.id}",
                {
                    "type": "tool_approval_request",
                    "data": {
                        "task_id": str(task_id),
                        "request_id": request_id,
                        "tool_name": tool_name,
                        "tool_input": tool_input,
                        "timeout": timeout,
                        "sequence": event_seq,
                    },
                },
            )
```

Add group handler in the runner consumer:

```python
    async def tool_approval_response(self, event):
        """Forward user's approval decision to the runner."""
        await self.send_json({
            "type": "tool.approval.response",
            **event["data"],
        })
```

**Step 2: Add tool.approval.respond handler in ToonyAgentConsumer**

In the frontend consumer's `receive_json`, after `question.answered`:

```python
        elif msg_type == "tool.approval.respond":
            task_id = content.get("task_id")
            request_id = content.get("request_id")
            decision = content.get("decision", "deny")

            if not task_id or not request_id:
                return

            # Broadcast to runner.
            agent_id = self.scope["url_route"]["kwargs"]["agent_id"]
            await self.channel_layer.group_send(
                f"toony_agent_runner_{agent_id}",
                {
                    "type": "tool_approval_response",
                    "data": {
                        "task_id": task_id,
                        "request_id": request_id,
                        "decision": decision,
                    },
                },
            )
```

Add group handler in the frontend consumer:

```python
    async def tool_approval_request(self, event):
        """Forward tool approval request to frontend."""
        await self.send_json({
            "type": "tool.approval.request",
            **event["data"],
        })
```

**Step 3: Run backend tests**

Run: `docker compose exec backend pytest tests/ -v --tb=short`
Expected: All PASSED

**Step 4: Commit**

```bash
git add backend/apps/toony_agents/consumers.py
git commit -m "feat(backend): add tool approval request/response WebSocket handlers"
```

---

### Task 7: Frontend — types, WebSocket hook, and approval card

**Files:**
- Modify: `frontend/types/toony-agents.ts`
- Modify: `frontend/hooks/use-toony-agent-websocket.ts`
- Modify: `frontend/components/toony-agents/task-event-item.tsx`
- Modify: `frontend/app/(dashboard)/toony-agents/[id]/tasks/[taskId]/page.tsx`

**Step 1: Add types**

In `frontend/types/toony-agents.ts`, add `TOOL_APPROVAL` to the `TaskEventType` union.

Add new WS event interface:

```typescript
export interface ToolApprovalRequestWsEvent {
  type: "tool.approval.request";
  task_id: string;
  request_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  timeout: number;
  sequence: number;
}
```

Add to `ToonyAgentWsEvent` union.

**Step 2: Add sendToolApproval to WebSocket hook**

In `use-toony-agent-websocket.ts`, add:

```typescript
const sendToolApproval = useCallback(
  (taskId: string, requestId: string, decision: "allow" | "deny") => {
    send({
      type: "tool.approval.respond",
      task_id: taskId,
      request_id: requestId,
      decision,
    });
  },
  [send],
);
```

Add to return object.

**Step 3: Handle tool.approval.request in task detail page**

In `page.tsx`, add handler in `handleWsEvent`:

```typescript
} else if (event.type === "tool.approval.request" && event.task_id === taskId) {
  const newEvent: TaskEventItem = {
    id: `ws-approval-${event.request_id}`,
    event_type: "TOOL_APPROVAL",
    data: {
      request_id: event.request_id,
      tool_name: event.tool_name,
      tool_input: event.tool_input,
      timeout: event.timeout,
      status: "pending",
    },
    sequence: event.sequence,
    created_at: new Date().toISOString(),
  };
  setEvents((prev) => [...prev, newEvent]);
}
```

**Step 4: Add TOOL_APPROVAL case to task-event-item.tsx**

Add new case before `QUESTION_ASKED`:

```tsx
    case "TOOL_APPROVAL": {
      const data = event.data as {
        request_id?: string;
        tool_name?: string;
        tool_input?: Record<string, unknown>;
        status?: string;
        timeout?: number;
      };
      const toolName = String(data.tool_name ?? "");
      const input = (data.tool_input ?? {}) as Record<string, unknown>;
      const requestId = String(data.request_id ?? "");
      const status = String(data.status ?? "pending");
      const isPending = status === "pending";

      const toolDetail =
        input.description ? String(input.description) :
        input.file_path ? String(input.file_path) :
        input.command ? String(input.command) :
        input.pattern ? String(input.pattern) :
        "";

      return (
        <div className="py-2">
          <div className={`rounded-lg border px-4 py-3 ${
            isPending
              ? "border-amber-500/50 bg-amber-500/5"
              : status === "allowed"
                ? "border-emerald-500/30 bg-emerald-500/5 opacity-60"
                : "border-red-500/30 bg-red-500/5 opacity-60"
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-amber-400 font-mono text-sm font-medium">
                  {toolName}
                </span>
                {toolDetail && (
                  <span className="text-slate-400 font-mono text-sm ml-2">
                    {toolDetail}
                  </span>
                )}
              </div>
              {isPending && !disabled && onMessage && (
                <div className="flex gap-2">
                  <button
                    onClick={() => onMessage(JSON.stringify({ type: "tool_approval", request_id: requestId, decision: "allow" }))}
                    className="px-3 py-1 text-xs font-medium rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                  >
                    Allow
                  </button>
                  <button
                    onClick={() => onMessage(JSON.stringify({ type: "tool_approval", request_id: requestId, decision: "deny" }))}
                    className="px-3 py-1 text-xs font-medium rounded bg-red-600 hover:bg-red-500 text-white transition-colors"
                  >
                    Deny
                  </button>
                </div>
              )}
              {!isPending && (
                <span className={`text-xs font-medium ${status === "allowed" ? "text-emerald-400" : "text-red-400"}`}>
                  {status === "allowed" ? "Allowed" : "Denied"}
                </span>
              )}
            </div>
            {Object.keys(input).length > 0 && (
              <pre className="mt-2 text-xs font-mono text-slate-500 whitespace-pre-wrap max-h-40 overflow-auto">
                {JSON.stringify(input, null, 2)}
              </pre>
            )}
          </div>
        </div>
      );
    }
```

**Step 5: Wire up approval buttons**

In the task detail page, handle the `onMessage` callback to detect tool approval messages and call `sendToolApproval`:

```typescript
const handleMessage = useCallback((text: string) => {
  try {
    const parsed = JSON.parse(text);
    if (parsed.type === "tool_approval") {
      sendToolApproval(taskId, parsed.request_id, parsed.decision);
      // Update event status locally
      setEvents((prev) =>
        prev.map((ev) =>
          ev.data.request_id === parsed.request_id
            ? { ...ev, data: { ...ev.data, status: parsed.decision === "allow" ? "allowed" : "denied" } }
            : ev
        )
      );
      return;
    }
  } catch {}
  // Regular message
  sendReply(taskId, text);
}, [taskId, sendToolApproval, sendReply]);
```

**Step 6: Verify build**

```bash
cd frontend && npx next build 2>&1 | tail -10
```

**Step 7: Commit**

```bash
git add frontend/types/toony-agents.ts frontend/hooks/use-toony-agent-websocket.ts frontend/components/toony-agents/task-event-item.tsx frontend/app/\(dashboard\)/toony-agents/\[id\]/tasks/\[taskId\]/page.tsx
git commit -m "feat(frontend): add tool approval UI with inline Allow/Deny cards"
```

---

### Task 8: Full integration test and push

**Step 1: Run all runner tests**

```bash
PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/ -v
```

**Step 2: Run backend tests**

```bash
docker compose exec backend pytest tests/ -v --tb=short
```

**Step 3: Build frontend**

```bash
cd frontend && npx next build 2>&1 | tail -10
```

**Step 4: Push**

```bash
git push origin worktree-control-protocol
```

**Step 5: Create PR**

```bash
gh pr create --title "feat(agent-runner): control protocol for tool approval" --base main --body "..."
```
