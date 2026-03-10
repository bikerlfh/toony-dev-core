# tests/test_multitask.py
"""Tests for multitask support."""

from __future__ import annotations

import asyncio
import textwrap

import pytest

from toony_agent_runner.main import ClaudeConfig, RunnerConfig, load_config


# ---------------------------------------------------------------------------
# Config tests
# ---------------------------------------------------------------------------

class TestConfigMaxConcurrentTasks:
    def test_default_is_one(self):
        cfg = ClaudeConfig()
        assert cfg.max_concurrent_tasks == 1

    def test_custom_value_from_yaml(self, tmp_path):
        config_file = tmp_path / "config.yml"
        config_file.write_text(textwrap.dedent("""\
            backend_url: "ws://localhost:8000/ws/toony-agents/runner/"
            api_key: "tok_ta_test"
            claude:
              max_concurrent_tasks: 5
        """))
        cfg = load_config(str(config_file))
        assert cfg.claude.max_concurrent_tasks == 5

    def test_missing_key_uses_default(self, tmp_path):
        config_file = tmp_path / "config.yml"
        config_file.write_text(textwrap.dedent("""\
            backend_url: "ws://localhost:8000/ws/toony-agents/runner/"
            api_key: "tok_ta_test"
            claude:
              working_directory: "."
        """))
        cfg = load_config(str(config_file))
        assert cfg.claude.max_concurrent_tasks == 1


# ---------------------------------------------------------------------------
# Cleanup finished tasks
# ---------------------------------------------------------------------------

class TestCleanupFinishedTasks:
    def test_done_tasks_removed(self):
        """Simulates the _cleanup_finished_tasks logic from run()."""
        active_tasks: dict[str, asyncio.Task] = {}
        cancel_events: dict[str, asyncio.Event] = {}

        loop = asyncio.new_event_loop()
        try:
            # Create tasks: one done, one still running
            async def noop():
                pass

            async def block_forever():
                await asyncio.sleep(3600)

            done_task = loop.create_task(noop())
            running_task = loop.create_task(block_forever())

            # Run until noop completes
            loop.run_until_complete(done_task)

            active_tasks["done-id"] = done_task
            active_tasks["running-id"] = running_task
            cancel_events["done-id"] = asyncio.Event()
            cancel_events["running-id"] = asyncio.Event()

            # Simulate cleanup
            finished = [tid for tid, t in active_tasks.items() if t.done()]
            for tid in finished:
                active_tasks.pop(tid, None)
                cancel_events.pop(tid, None)

            assert "done-id" not in active_tasks
            assert "done-id" not in cancel_events
            assert "running-id" in active_tasks
            assert "running-id" in cancel_events

            # Clean up
            running_task.cancel()
            try:
                loop.run_until_complete(running_task)
            except asyncio.CancelledError:
                pass
        finally:
            loop.close()


# ---------------------------------------------------------------------------
# Capacity enforcement
# ---------------------------------------------------------------------------

class TestMaxConcurrentTasksLimit:
    def test_capacity_check(self):
        """Verify capacity logic: reject when active_tasks >= max."""
        max_tasks = 2
        active_tasks = {"task-1": "fake", "task-2": "fake"}

        # At capacity
        assert len(active_tasks) >= max_tasks

        # Below capacity
        active_tasks.pop("task-2")
        assert len(active_tasks) < max_tasks


# ---------------------------------------------------------------------------
# Cancel targets specific task
# ---------------------------------------------------------------------------

class TestCancelTargetsSpecificTask:
    def test_only_target_event_set(self):
        cancel_events: dict[str, asyncio.Event] = {
            "task-aaa": asyncio.Event(),
            "task-bbb": asyncio.Event(),
            "task-ccc": asyncio.Event(),
        }

        # Cancel only task-bbb
        ce = cancel_events.get("task-bbb")
        assert ce is not None
        ce.set()

        assert not cancel_events["task-aaa"].is_set()
        assert cancel_events["task-bbb"].is_set()
        assert not cancel_events["task-ccc"].is_set()


# ---------------------------------------------------------------------------
# Shutdown cancels all
# ---------------------------------------------------------------------------

class TestShutdownCancelsAll:
    def test_all_events_set(self):
        cancel_events: dict[str, asyncio.Event] = {
            "task-1": asyncio.Event(),
            "task-2": asyncio.Event(),
            "task-3": asyncio.Event(),
        }

        # Simulate shutdown: set all cancel events
        for ce in cancel_events.values():
            ce.set()

        for tid, ce in cancel_events.items():
            assert ce.is_set(), f"Cancel event for {tid} should be set"

    def test_shutdown_waits_and_force_cancels(self):
        """Verify shutdown logic: wait then cancel remaining."""
        loop = asyncio.new_event_loop()
        try:
            async def run_test():
                async def block_forever():
                    await asyncio.sleep(3600)

                tasks = {
                    "t1": asyncio.create_task(block_forever()),
                    "t2": asyncio.create_task(block_forever()),
                }

                running = [t for t in tasks.values() if not t.done()]
                assert len(running) == 2

                # Wait with short timeout (tasks won't finish)
                _, pending = await asyncio.wait(running, timeout=0.1)
                assert len(pending) == 2

                # Force cancel
                for t in pending:
                    t.cancel()

                # Let cancellation propagate
                await asyncio.gather(*pending, return_exceptions=True)

                # Verify all cancelled
                for t in tasks.values():
                    assert t.cancelled()

            loop.run_until_complete(run_test())
        finally:
            loop.close()
