# Runner Config Update from Frontend — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow editing `max_concurrent_tasks` and `max_task_timeout` from the agent detail page, relay via WebSocket to the runner, apply in memory, and persist to `config.yml`.

**Architecture:** New `config.update` message type flows Frontend → Backend (relay) → Runner. Runner validates, applies in-memory, persists YAML, sends ack + re-registers with updated metadata. Backend relays ack to frontend.

**Tech Stack:** Django Channels (backend relay), Python asyncio + PyYAML (runner), React/TypeScript (frontend modal)

---

### Task 1: Runner — Add `ConfigUpdate` and `ConfigUpdateAckMessage` to protocol

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/protocol.py`

**Step 1: Add the new dataclasses and update parser**

In `protocol.py`, add `ConfigUpdate` incoming message after `ConfigSync` (line 188), add `ConfigUpdateAckMessage` outgoing message after `ConfigSyncAckMessage` (line 226), update `IncomingMessage` union, and add parsing case in `parse_server_message`:

```python
# After ConfigSync dataclass (line 188):
@dataclass
class ConfigUpdate:
    """Backend relays a config update from the frontend."""
    max_concurrent_tasks: int | None = None
    max_task_timeout: int | None = None

# After ConfigSyncAckMessage (line 226):
@dataclass
class ConfigUpdateAckMessage:
    """Acknowledges a config update from the frontend."""
    success: bool
    metadata: dict[str, Any] = field(default_factory=dict)
    error: str = ""

    def to_json(self) -> dict:
        return {
            "type": "config.update.ack",
            "success": self.success,
            "metadata": self.metadata,
            "error": self.error,
        }
```

Update the `IncomingMessage` union (line 234) to include `ConfigUpdate`.

Update module docstring (line 10) to include `ConfigUpdate` in the incoming list.

Add parsing case in `parse_server_message` before the final `raise ValueError`:

```python
if msg_type == "config.update":
    return ConfigUpdate(
        max_concurrent_tasks=data.get("max_concurrent_tasks"),
        max_task_timeout=data.get("max_task_timeout"),
    )
```

**Step 2: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/protocol.py
git commit -m "feat(runner): add ConfigUpdate and ConfigUpdateAckMessage protocol messages"
```

---

### Task 2: Runner — Add `save_config` to `config.py`

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/config.py`

**Step 1: Add the `save_config` function**

Append after the `load_config` function (after line 103):

```python
def save_config(path: str, config: RunnerConfig) -> None:
    """Persist the current configuration back to the YAML file."""
    data: dict[str, Any] = {
        "backend_url": config.backend_url,
        "api_key": config.api_key,
    }
    if config.workspace_root:
        data["workspace_root"] = config.workspace_root

    data["claude"] = {
        "working_directory": config.claude.working_directory,
        "max_task_timeout": config.claude.max_task_timeout,
        "approval_timeout": config.claude.approval_timeout,
        "max_concurrent_tasks": config.claude.max_concurrent_tasks,
        "permission_mode": config.claude.permission_mode,
    }
    if config.claude.oauth_token:
        data["claude"]["oauth_token"] = config.claude.oauth_token
    if config.claude.allowed_tools != _DEFAULT_ALLOWED_TOOLS:
        data["claude"]["allowed_tools"] = config.claude.allowed_tools
    if config.claude.disallowed_tools:
        data["claude"]["disallowed_tools"] = config.claude.disallowed_tools

    data["reconnect"] = {
        "max_retries": config.reconnect.max_retries,
        "backoff_base": config.reconnect.backoff_base,
        "backoff_max": config.reconnect.backoff_max,
    }

    config_path = Path(path)
    with open(config_path, "w") as f:
        yaml.dump(data, f, default_flow_style=False, sort_keys=False)
    logger.info("Config saved to %s", path)
```

Add `from typing import Any` import at top (line 7, alongside existing imports).

**Step 2: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/config.py
git commit -m "feat(runner): add save_config function to persist config to YAML"
```

---

### Task 3: Runner — Handle `ConfigUpdate` in main loop

**Files:**
- Modify: `toony_agent_runner/toony_agent_runner/main.py`

**Step 1: Add imports**

Update the protocol imports (line 28-41) to include `ConfigUpdate` and `ConfigUpdateAckMessage`.

Update the config imports (line 26) to include `save_config`.

**Step 2: Add handler in the main message loop**

After the `ConfigSync` handler block (after line 358), add a new `elif` for `ConfigUpdate`:

```python
elif isinstance(msg, ConfigUpdate):
    logger.info("Received config.update: %s", {
        "max_concurrent_tasks": msg.max_concurrent_tasks,
        "max_task_timeout": msg.max_task_timeout,
    })
    try:
        if msg.max_concurrent_tasks is not None:
            if not (1 <= msg.max_concurrent_tasks <= 100):
                raise ValueError(f"max_concurrent_tasks must be 1-100, got {msg.max_concurrent_tasks}")
            config.claude.max_concurrent_tasks = msg.max_concurrent_tasks
            max_tasks = msg.max_concurrent_tasks

        if msg.max_task_timeout is not None:
            if not (60 <= msg.max_task_timeout <= 28800):
                raise ValueError(f"max_task_timeout must be 60-28800, got {msg.max_task_timeout}")
            config.claude.max_task_timeout = msg.max_task_timeout

        save_config(args.config, config)

        # Re-register with updated metadata.
        metadata["max_concurrent_tasks"] = config.claude.max_concurrent_tasks
        metadata["max_task_timeout"] = config.claude.max_task_timeout
        await conn.send(RegisterMessage(metadata=metadata).to_json())
        await conn.send(
            ConfigUpdateAckMessage(
                success=True,
                metadata=metadata,
            ).to_json()
        )
        logger.info("Config update applied and saved")
    except Exception as exc:
        logger.error("Config update failed: %s", exc)
        await conn.send(
            ConfigUpdateAckMessage(
                success=False, error=str(exc)
            ).to_json()
        )
```

Note: `args.config` is not accessible inside `run()`. We need to pass the config path. Update `run()` signature to accept `config_path: str`:

- Change `async def run(config: RunnerConfig)` to `async def run(config: RunnerConfig, config_path: str)`
- In `cli()` (line 434), change `asyncio.run(run(config))` to `asyncio.run(run(config, args.config))`
- Use `config_path` instead of `args.config` in the handler: `save_config(config_path, config)`

**Step 3: Commit**

```bash
git add toony_agent_runner/toony_agent_runner/main.py
git commit -m "feat(runner): handle config.update message — apply in memory, persist to YAML, re-register"
```

---

### Task 4: Backend — Add `config.update` relay in consumers

**Files:**
- Modify: `backend/apps/toony_agents/consumers.py`

**Step 1: Add frontend consumer handler**

In `ToonyAgentConsumer.receive_json` (after the `config.sync.request` block at line 684), add:

```python
elif msg_type == "config.update":
    config_data = {}
    if "max_concurrent_tasks" in content:
        config_data["max_concurrent_tasks"] = content["max_concurrent_tasks"]
    if "max_task_timeout" in content:
        config_data["max_task_timeout"] = content["max_task_timeout"]
    await self.channel_layer.group_send(
        runner_group,
        {"type": "config_update", "data": config_data},
    )
```

**Step 2: Add runner consumer group handler**

In `ToonyAgentRunnerConsumer`, add a new group handler after `config_sync_request` (after line 516):

```python
async def config_update(self, event):
    """Frontend requested config update — relay to runner."""
    msg = {"type": "config.update"}
    msg.update(event["data"])
    await self.send_json(msg)
```

**Step 3: Add runner consumer ack handler**

In `ToonyAgentRunnerConsumer.receive_json`, after the `config.sync.ack` block (after line 459), add:

```python
elif msg_type == "config.update.ack":
    success = content.get("success", False)
    metadata = content.get("metadata", {})
    if success and metadata:
        await _set_agent_status(self.agent_id, None, metadata=metadata)
    await self.channel_layer.group_send(
        self.frontend_group,
        {
            "type": "config_update_status",
            "data": {
                "success": success,
                "metadata": metadata,
                "error": content.get("error", ""),
            },
        },
    )
```

**Step 4: Add frontend consumer group handler for config_update_status**

In `ToonyAgentConsumer`, add after `config_sync_status` (after line 704):

```python
async def config_update_status(self, event):
    await self.send_json({"type": "config.update.status", **event["data"]})
```

**Step 5: Commit**

```bash
git add backend/apps/toony_agents/consumers.py
git commit -m "feat(backend): add config.update relay between frontend and runner consumers"
```

---

### Task 5: Frontend — Add `ConfigUpdateStatusWsEvent` type and hook helper

**Files:**
- Modify: `frontend/types/toony-agents.ts`
- Modify: `frontend/hooks/use-toony-agent-websocket.ts`

**Step 1: Add WS event type**

In `frontend/types/toony-agents.ts`, after `ConfigSyncStatusWsEvent` (after line 156), add:

```typescript
export interface ConfigUpdateStatusWsEvent {
  type: "config.update.status";
  success: boolean;
  metadata: Record<string, unknown>;
  error?: string;
}
```

Update the `ToonyAgentWsEvent` union (line 158-163) to include `ConfigUpdateStatusWsEvent`.

**Step 2: Add `sendConfigUpdate` to the hook**

In `frontend/hooks/use-toony-agent-websocket.ts`:

Add `sendConfigUpdate` to the return type (after `sendConfigSync: () => void;`):

```typescript
sendConfigUpdate: (config: { max_concurrent_tasks?: number; max_task_timeout?: number }) => void;
```

Add the implementation after `sendConfigSync` (after line 75):

```typescript
const sendConfigUpdate = useCallback(
  (config: { max_concurrent_tasks?: number; max_task_timeout?: number }) => {
    send({ type: "config.update", ...config });
  },
  [send],
);
```

Add `sendConfigUpdate` to the return object.

**Step 3: Commit**

```bash
git add frontend/types/toony-agents.ts frontend/hooks/use-toony-agent-websocket.ts
git commit -m "feat(frontend): add ConfigUpdateStatus WS event type and sendConfigUpdate hook helper"
```

---

### Task 6: Frontend — Add Runner Settings modal and button to agent detail page

**Files:**
- Modify: `frontend/app/(dashboard)/toony-agents/[id]/page.tsx`

**Step 1: Add state and WS event handler**

Add new state variables after `syncResult` state (after line 105):

```typescript
const [showSettingsModal, setShowSettingsModal] = useState(false);
const [settingsSaving, setSettingsSaving] = useState(false);
const [settingsError, setSettingsError] = useState("");
```

In the `handleWsEvent` callback, add a new case for `config.update.status` after the `config.sync.status` block:

```typescript
} else if (event.type === "config.update.status") {
  setSettingsSaving(false);
  if (event.success) {
    setAgent((prev) =>
      prev && event.metadata ? { ...prev, metadata: event.metadata } : prev
    );
    setShowSettingsModal(false);
    setSettingsError("");
  } else {
    setSettingsError(event.error || "Update failed");
  }
}
```

**Step 2: Add `sendConfigUpdate` to the hook destructure**

Update the destructure (line 174-178) to include `sendConfigUpdate`:

```typescript
const { readyState, sendAnswer, sendReply, cancelTask, sendConfigSync, sendConfigUpdate } =
```

**Step 3: Add Runner Settings button**

In the header buttons area (after the "Sync Config" button block, around line 362), add:

```tsx
<button
  onClick={() => setShowSettingsModal(true)}
  className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-slate-600 hover:text-white"
>
  Runner Settings
</button>
```

Wrap this button in the same `agent.status !== "OFFLINE"` condition as "Sync Config", or add it inside the existing conditional block.

**Step 4: Add the Runner Settings modal**

After the Remove Organization Confirm modal (after line 630), add the modal JSX:

```tsx
{showSettingsModal && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    onClick={(e) => {
      if (e.target === e.currentTarget) {
        setShowSettingsModal(false);
        setSettingsError("");
      }
    }}
  >
    <div className="w-full max-w-sm rounded-xl border border-slate-800/60 bg-slate-900 p-6">
      <h2 className="text-base font-medium tracking-tight text-white">
        Runner Settings
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Update runner configuration. Changes apply immediately.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const concurrency = parseInt(
            (form.elements.namedItem("concurrency") as HTMLInputElement).value,
            10
          );
          const timeoutMin = parseInt(
            (form.elements.namedItem("timeout") as HTMLInputElement).value,
            10
          );
          if (isNaN(concurrency) || concurrency < 1 || concurrency > 100) return;
          if (isNaN(timeoutMin) || timeoutMin < 1 || timeoutMin > 480) return;
          setSettingsSaving(true);
          setSettingsError("");
          sendConfigUpdate({
            max_concurrent_tasks: concurrency,
            max_task_timeout: timeoutMin * 60,
          });
        }}
      >
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300">
              Max Concurrent Tasks
            </label>
            <input
              name="concurrency"
              type="number"
              min={1}
              max={100}
              defaultValue={
                typeof agent.metadata?.max_concurrent_tasks === "number"
                  ? agent.metadata.max_concurrent_tasks
                  : 1
              }
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-slate-600">1–100 concurrent tasks</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">
              Task Timeout
            </label>
            <input
              name="timeout"
              type="number"
              min={1}
              max={480}
              defaultValue={
                typeof agent.metadata?.max_task_timeout === "number"
                  ? Math.round((agent.metadata.max_task_timeout as number) / 60)
                  : 60
              }
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-slate-600">1–480 minutes per task</p>
          </div>
        </div>
        {settingsError && (
          <p className="mt-3 text-sm text-red-400">{settingsError}</p>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              setShowSettingsModal(false);
              setSettingsError("");
            }}
            className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={settingsSaving}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {settingsSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  </div>
)}
```

**Step 5: Commit**

```bash
git add frontend/app/\(dashboard\)/toony-agents/\[id\]/page.tsx
git commit -m "feat(frontend): add Runner Settings modal to agent detail page"
```

---

### Task 7: Manual integration test

**Steps:**
1. Start backend: `make up-backend`
2. Start frontend: `make up` or `make up-frontend`
3. Start runner: `cd toony_agent_runner && toony-agent-runner --config config.yml --verbose`
4. Open agent detail page in browser
5. Verify "Concurrency" and "Timeout" appear in header
6. Click "Runner Settings" button
7. Change values (e.g., concurrency to 5, timeout to 30m)
8. Click "Save" — verify modal closes, header updates
9. Check runner logs for "Config update applied and saved"
10. Check `config.yml` has the new values persisted
11. Disconnect runner — verify "Runner Settings" button disappears
12. Reconnect runner — verify metadata re-appears with saved values
