"""
Manage a Claude CLI subprocess.

Spawns ``claude --output-format stream-json -p <prompt>`` and provides
an async interface to stream parsed events from stdout, write to stdin
(for approval responses), and cancel the process.
"""

from __future__ import annotations

import asyncio
import logging
import shutil
import signal
from collections.abc import AsyncIterator

from .stream_parser import parse_stream_json_line

logger = logging.getLogger(__name__)

# Grace period (seconds) between SIGTERM and SIGKILL.
_KILL_GRACE_PERIOD = 5.0


class ClaudeProcess:
    """Wrapper around an ``asyncio.subprocess`` running the Claude CLI.

    Parameters
    ----------
    binary:
        Path or name of the claude executable (default ``"claude"``).
    working_dir:
        Working directory for the subprocess.
    output_format:
        The ``--output-format`` value passed to the CLI.
    """

    def __init__(
        self,
        binary: str = "claude",
        working_dir: str = ".",
        output_format: str = "stream-json",
    ) -> None:
        self._binary = binary
        self._working_dir = working_dir
        self._output_format = output_format
        self._process: asyncio.subprocess.Process | None = None
        self._stderr_task: asyncio.Task | None = None

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def is_running(self) -> bool:
        return self._process is not None and self._process.returncode is None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self, prompt: str, *, session_id: str | None = None) -> None:
        """Spawn the Claude CLI with the given prompt.

        The process is started with stdin, stdout, and stderr as pipes so
        we can stream output and write approval responses.

        Parameters
        ----------
        prompt:
            The prompt text to send to Claude.
        session_id:
            If provided, resumes an existing conversation via ``--resume``.
        """
        cmd = [self._binary]
        if session_id:
            cmd.extend(["--resume", session_id])
        cmd.extend([
            "--output-format",
            self._output_format,
            "--verbose",
            "-p",
            prompt,
        ])
        resolved_binary = shutil.which(self._binary)
        logger.info(
            "Starting Claude process: %s (binary: %s, cwd: %s, session_id: %s)",
            " ".join(cmd[:7]) + " ...",
            resolved_binary or "NOT FOUND",
            self._working_dir,
            session_id or "new",
        )

        self._process = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=self._working_dir,
        )
        logger.info("Claude process started (pid=%d)", self._process.pid)
        self._stderr_task = asyncio.create_task(self._drain_stderr())

    async def _drain_stderr(self) -> None:
        """Read stderr line by line to prevent pipe buffer deadlock."""
        if self._process is None or self._process.stderr is None:
            return
        logger.debug("stderr drain started")
        line_count = 0
        while True:
            line_bytes = await self._process.stderr.readline()
            if not line_bytes:
                break
            line_count += 1
            line = line_bytes.decode("utf-8", errors="replace").rstrip()
            if not line:
                continue
            lowered = line.lower()
            if "error" in lowered or "fatal" in lowered:
                logger.warning("Claude stderr: %s", line)
            else:
                logger.debug("Claude stderr: %s", line)
        logger.debug("stderr drain EOF — read %d lines", line_count)

    async def stream_events(self) -> AsyncIterator[dict]:
        """Yield parsed JSON events from Claude's stdout, line by line.

        Skips blank lines and lines that are not valid JSON.  Terminates
        when stdout reaches EOF (process exited or stdout closed).
        """
        if self._process is None or self._process.stdout is None:
            logger.warning("stream_events called but process/stdout is None")
            return

        logger.info("Starting to stream events from Claude stdout")
        count = 0

        while True:
            line_bytes = await self._process.stdout.readline()
            if not line_bytes:
                break

            line = line_bytes.decode("utf-8", errors="replace")
            logger.debug("Claude stdout raw: %s", line.rstrip()[:300])
            event = parse_stream_json_line(line)
            if event is not None:
                count += 1
                yield event

        rc = self._process.returncode
        logger.info(
            "Claude stdout EOF — streamed %d events (exit_code=%s)", count, rc
        )

    async def send_input(self, text: str) -> None:
        """Write *text* to the process's stdin.

        Used to send approval responses back to Claude.  A newline is
        appended automatically if *text* does not already end with one.

        NOTE: Currently stdin is opened as DEVNULL, so this method will
        always warn and return.  When approval-gate support is added,
        stdin should be switched back to PIPE conditionally.
        """
        if self._process is None or self._process.stdin is None:
            logger.warning("Cannot send input: stdin unavailable (opened as DEVNULL)")
            return

        if not text.endswith("\n"):
            text += "\n"

        self._process.stdin.write(text.encode("utf-8"))
        await self._process.stdin.drain()
        logger.debug("Sent input to Claude stdin: %s", text.strip()[:100])

    async def cancel(self) -> None:
        """Cancel the running Claude process.

        Sends SIGTERM first, then SIGKILL after a grace period if the
        process has not exited.
        """
        if not self.is_running:
            return

        pid = self._process.pid  # type: ignore[union-attr]
        logger.info("Cancelling Claude process (pid=%d)", pid)

        try:
            self._process.send_signal(signal.SIGTERM)  # type: ignore[union-attr]
        except ProcessLookupError:
            return

        try:
            await asyncio.wait_for(
                self._process.wait(),  # type: ignore[union-attr]
                timeout=_KILL_GRACE_PERIOD,
            )
            logger.info("Claude process terminated gracefully")
        except asyncio.TimeoutError:
            logger.warning(
                "Claude process did not exit after %.1fs, sending SIGKILL",
                _KILL_GRACE_PERIOD,
            )
            try:
                self._process.kill()  # type: ignore[union-attr]
                await self._process.wait()  # type: ignore[union-attr]
            except ProcessLookupError:
                pass

        await self._cleanup_stderr_task()

    async def _cleanup_stderr_task(self) -> None:
        """Cancel and await the stderr drain task."""
        if self._stderr_task is not None:
            self._stderr_task.cancel()
            try:
                await self._stderr_task
            except asyncio.CancelledError:
                pass
            self._stderr_task = None

    async def wait(self) -> int:
        """Wait for the process to exit and return its exit code."""
        if self._process is None:
            return -1
        exit_code = await self._process.wait()
        await self._cleanup_stderr_task()
        return exit_code
