"""
WebSocket connection to the Toony Dev Core backend.

Handles:
- Initial connection with API key authentication via query param
- Automatic reconnection with exponential backoff
- Message buffering while disconnected
- Connection state logging
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections import deque
from typing import Any

import websockets
from websockets.asyncio.client import ClientConnection

logger = logging.getLogger(__name__)


class BackendConnection:
    """Persistent WebSocket connection to the Toony backend.

    Parameters
    ----------
    url:
        WebSocket URL, e.g. ``ws://localhost:8000/ws/toony-agents/runner/``
    api_key:
        Runner API key for authentication.
    backoff_base:
        Base delay in seconds for exponential backoff (default 1).
    backoff_max:
        Maximum delay in seconds between reconnection attempts (default 30).
    max_retries:
        Maximum reconnection attempts. ``-1`` means unlimited (default).
    """

    def __init__(
        self,
        url: str,
        api_key: str,
        backoff_base: float = 1.0,
        backoff_max: float = 30.0,
        max_retries: int = -1,
    ) -> None:
        self._url = url
        self._api_key = api_key
        self._backoff_base = backoff_base
        self._backoff_max = backoff_max
        self._max_retries = max_retries

        self._ws: ClientConnection | None = None
        self._buffer: deque[dict] = deque()
        self._connected = False
        self._closing = False
        self.pending_approvals: dict[str, asyncio.Future[dict[str, Any]]] = {}

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def is_connected(self) -> bool:
        return self._connected and self._ws is not None

    # ------------------------------------------------------------------
    # Connection lifecycle
    # ------------------------------------------------------------------

    async def connect(self) -> None:
        """Open the WebSocket connection.

        Raises ``websockets.exceptions.WebSocketException`` on failure.
        """
        connect_url = f"{self._url}?key={self._api_key}"
        logger.info("Connecting to %s", self._url)

        self._ws = await websockets.connect(connect_url)
        self._connected = True
        logger.info("Connected to backend")

        # Flush any messages that were buffered while disconnected.
        await self._flush_buffer()

    async def reconnect(self) -> None:
        """Reconnect with exponential backoff.

        Blocks until reconnection succeeds or ``max_retries`` is exhausted.
        """
        attempt = 0
        while not self._closing:
            attempt += 1
            if self._max_retries != -1 and attempt > self._max_retries:
                logger.error(
                    "Max reconnection attempts (%d) reached", self._max_retries
                )
                raise ConnectionError("Max reconnection attempts reached")

            delay = min(
                self._backoff_base * (2 ** (attempt - 1)),
                self._backoff_max,
            )
            logger.info(
                "Reconnecting in %.1fs (attempt %d)...", delay, attempt
            )
            await asyncio.sleep(delay)

            try:
                await self.connect()
                logger.info("Reconnected after %d attempt(s)", attempt)
                return
            except Exception as exc:
                logger.warning("Reconnection attempt %d failed: %s", attempt, exc)

    async def close(self) -> None:
        """Gracefully close the WebSocket."""
        self._closing = True
        self._connected = False
        if self._ws is not None:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._ws = None
        logger.info("Connection closed")

    # ------------------------------------------------------------------
    # Send / receive
    # ------------------------------------------------------------------

    async def send(self, msg: dict[str, Any]) -> None:
        """Send a JSON message. Buffers the message if disconnected."""
        if not self.is_connected:
            logger.debug("Buffering message (disconnected): %s", msg.get("type"))
            self._buffer.append(msg)
            return

        try:
            await self._ws.send(json.dumps(msg))  # type: ignore[union-attr]
        except websockets.exceptions.ConnectionClosed:
            logger.warning("Send failed (connection lost), buffering message")
            self._connected = False
            self._buffer.append(msg)

    async def receive(self) -> dict[str, Any]:
        """Receive the next JSON message from the backend.

        Raises ``websockets.exceptions.ConnectionClosed`` if the connection
        drops (caller should handle reconnection).
        """
        if self._ws is None:
            raise ConnectionError("Not connected")

        try:
            raw = await self._ws.recv()
            return json.loads(raw)
        except websockets.exceptions.ConnectionClosed:
            self._connected = False
            raise

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _flush_buffer(self) -> None:
        """Send all buffered messages."""
        count = len(self._buffer)
        if count:
            logger.info("Flushing %d buffered message(s)", count)
        while self._buffer and self.is_connected:
            msg = self._buffer.popleft()
            try:
                await self._ws.send(json.dumps(msg))  # type: ignore[union-attr]
            except websockets.exceptions.ConnectionClosed:
                # Put it back and bail out.
                self._buffer.appendleft(msg)
                self._connected = False
                raise
