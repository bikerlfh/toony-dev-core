"""Claude Agent SDK option building and hook creation."""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

from claude_agent_sdk import (
    ClaudeAgentOptions,
    HookMatcher,
    PermissionResultAllow,
)
from claude_agent_sdk.types import (
    HookContext,
    PreToolUseHookInput,
    SyncHookJSONOutput,
)

from .config import RunnerConfig
from .connection import BackendConnection
from .protocol import ApprovalNeededMessage

logger = logging.getLogger("toony_agent_runner")


def _build_sdk_options(
    config: RunnerConfig,
    hook_callback: Any | None = None,
    session_id: str | None = None,
) -> ClaudeAgentOptions:
    """Build ``ClaudeAgentOptions`` from the runner configuration.

    Parameters
    ----------
    config:
        The full runner configuration.
    hook_callback:
        Optional ``PreToolUse`` hook callback for intercepting
        ``AskUserQuestion`` calls.
    session_id:
        If provided, resume the given session instead of starting fresh.
    """
    # Inject OAuth token into environment if configured.
    # Strip surrounding quotes in case user wrapped the token in quotes.
    oauth_token = (
        config.claude.oauth_token
        or os.environ.get("CLAUDE_CODE_OAUTH_TOKEN", "")
    ).strip().strip("\"'")
    env: dict[str, str] = {}
    if oauth_token:
        env["CLAUDE_CODE_OAUTH_TOKEN"] = oauth_token

    # Build PreToolUse hooks if a callback is provided.
    hooks = None
    if hook_callback is not None:
        hooks = {
            "PreToolUse": [
                HookMatcher(
                    matcher="AskUserQuestion",
                    hooks=[hook_callback],
                    timeout=float(config.claude.approval_timeout),
                ),
            ],
        }

    opts = ClaudeAgentOptions(
        cwd=config.claude.working_directory,
        allowed_tools=list(config.claude.allowed_tools),
        permission_mode=config.claude.permission_mode,  # type: ignore[arg-type]
        can_use_tool=_auto_approve_tool,
        hooks=hooks,
        resume=session_id,
        env=env,
        include_partial_messages=True,
    )
    return opts


async def _auto_approve_tool(
    tool_name: str,
    tool_input: dict[str, Any],
    ctx: Any,
) -> PermissionResultAllow:
    """Always-allow ``can_use_tool`` callback.

    Its only purpose is to make the SDK set ``--permission-prompt-tool stdio``,
    which enables the bidirectional control protocol required for hook callbacks.
    """
    return PermissionResultAllow()


def _make_pretooluse_hook(
    conn: BackendConnection,
    task_id: str,
    config: RunnerConfig,
):
    """Create a ``PreToolUse`` hook callback for ``AskUserQuestion``.

    Unlike ``can_use_tool``, PreToolUse hooks fire for **all** tool uses
    before execution — regardless of permission mode.  This means the hook
    reliably intercepts ``AskUserQuestion`` even when the CLI auto-approves it
    under ``acceptEdits`` mode.

    The hook:
    1. Sends an ``ApprovalNeededMessage`` to the backend via WebSocket.
    2. Creates an ``asyncio.Future`` stored on ``conn.pending_approval``.
    3. Awaits the future (resolved by the main loop on ``ApprovalResponse``).
    4. Always returns ``permissionDecision: "deny"`` with the user's answer
       as ``permissionDecisionReason``.  We deny because there is no terminal
       for the CLI to render the question — Claude receives the answer via
       the denial reason and continues normally.
    """
    seq_counter = [0]

    async def hook(
        input_data: PreToolUseHookInput,
        tool_use_id: str | None,
        context: HookContext,
    ) -> SyncHookJSONOutput:
        seq_counter[0] += 1
        sequence = seq_counter[0]

        tool_input = input_data.tool_input

        # Build approval data in the format the frontend expects:
        # { question: string, options?: [{label, description}], tool_name: string }
        questions = tool_input.get("questions", [])
        if questions:
            first_q = questions[0]
            approval_data: dict[str, Any] = {
                "question": first_q.get("question", "Approval required"),
                "options": first_q.get("options"),
                "tool_name": "AskUserQuestion",
            }
        else:
            approval_data = {
                "question": str(tool_input) if tool_input else "Approval required",
                "tool_name": "AskUserQuestion",
            }

        await conn.send(
            ApprovalNeededMessage(task_id, approval_data, sequence).to_json()
        )
        logger.info(
            "Approval needed for task %s: AskUserQuestion (seq=%d)",
            task_id, sequence,
        )

        # Guard against concurrent approvals for the same task.
        existing = conn.pending_approvals.get(task_id)
        if existing is not None and not existing.done():
            logger.error(
                "New approval requested (seq=%d) while a previous approval is "
                "still pending for task %s — this is a bug; rejecting",
                sequence, task_id,
            )
            return SyncHookJSONOutput(
                hookSpecificOutput={
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": "Concurrent approval conflict",
                }
            )

        # Create a future for the main message loop to resolve.
        loop = asyncio.get_running_loop()
        future: asyncio.Future[dict[str, Any]] = loop.create_future()
        conn.pending_approvals[task_id] = future

        try:
            response = await asyncio.wait_for(
                future,
                timeout=config.claude.approval_timeout,
            )
        except asyncio.TimeoutError:
            logger.warning(
                "Approval timeout for task %s (seq=%d)", task_id, sequence
            )
            return SyncHookJSONOutput(
                hookSpecificOutput={
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": "Approval timeout",
                }
            )
        finally:
            conn.pending_approvals.pop(task_id, None)

        if response.get("action") == "reject":
            logger.info("Approval rejected for task %s (seq=%d)", task_id, sequence)
            reason = response.get("response") or "Approval rejected by user"
        else:
            reason = response.get("response") or "User approved"

        # Always deny: prevents the CLI from executing AskUserQuestion
        # (headless — no terminal).  Claude receives the user's answer
        # as the denial reason and uses it to continue.
        return SyncHookJSONOutput(
            hookSpecificOutput={
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": reason,
            }
        )

    return hook
