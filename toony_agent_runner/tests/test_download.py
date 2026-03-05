"""Tests for download commands."""

from __future__ import annotations

import asyncio
import http.server
import threading
from pathlib import Path

import pytest

from toony_agent_runner.commands.download import download_backend, download_url


class TestDownloadUrl:
    @pytest.fixture(autouse=True)
    def _serve(self, tmp_path: Path):
        serve_dir = tmp_path / "serve"
        serve_dir.mkdir()
        (serve_dir / "test.txt").write_text("hello from server")
        handler = lambda *a, **kw: http.server.SimpleHTTPRequestHandler(
            *a, directory=str(serve_dir), **kw
        )
        self.server = http.server.HTTPServer(("127.0.0.1", 0), handler)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        yield
        self.server.shutdown()

    def test_downloads_file(self, tmp_path: Path):
        sandbox = tmp_path / "sandbox"
        sandbox.mkdir()
        result = asyncio.run(
            download_url(
                {"url": f"http://127.0.0.1:{self.port}/test.txt", "destination": "test.txt"},
                sandbox,
            )
        )
        assert result.success
        assert (sandbox / "test.txt").read_text() == "hello from server"

    def test_creates_parent_dirs(self, tmp_path: Path):
        sandbox = tmp_path / "sandbox"
        sandbox.mkdir()
        result = asyncio.run(
            download_url(
                {
                    "url": f"http://127.0.0.1:{self.port}/test.txt",
                    "destination": "sub/dir/test.txt",
                },
                sandbox,
            )
        )
        assert result.success
        assert (sandbox / "sub" / "dir" / "test.txt").read_text() == "hello from server"

    def test_missing_args(self, tmp_path: Path):
        sandbox = tmp_path / "sandbox"
        sandbox.mkdir()
        result = asyncio.run(download_url({}, sandbox))
        assert not result.success
        assert "Missing required args" in result.error

    def test_bad_url(self, tmp_path: Path):
        sandbox = tmp_path / "sandbox"
        sandbox.mkdir()
        result = asyncio.run(
            download_url(
                {"url": "http://127.0.0.1:1/nope.txt", "destination": "nope.txt"},
                sandbox,
            )
        )
        assert not result.success
        assert "Download failed" in result.error


class _AuthHandler(http.server.BaseHTTPRequestHandler):
    """HTTP handler that requires Bearer tok_ta_test authorization."""

    expected_token = "tok_ta_test"

    def do_GET(self):
        auth = self.headers.get("Authorization", "")
        if auth != f"Bearer {self.expected_token}":
            self.send_error(403, "Forbidden")
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.end_headers()
        self.wfile.write(b"secure payload")

    def log_message(self, format, *args):
        # Suppress request logs during tests
        pass


class TestDownloadBackend:
    @pytest.fixture(autouse=True)
    def _serve(self, tmp_path: Path):
        self.server = http.server.HTTPServer(("127.0.0.1", 0), _AuthHandler)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        yield
        self.server.shutdown()

    def test_downloads_with_auth(self, tmp_path: Path):
        sandbox = tmp_path / "sandbox"
        sandbox.mkdir()
        result = asyncio.run(
            download_backend(
                {
                    "download_url": f"http://127.0.0.1:{self.port}/file.bin",
                    "destination": "file.bin",
                    "api_key": "tok_ta_test",
                },
                sandbox,
            )
        )
        assert result.success
        assert (sandbox / "file.bin").read_bytes() == b"secure payload"

    def test_auth_failure(self, tmp_path: Path):
        sandbox = tmp_path / "sandbox"
        sandbox.mkdir()
        result = asyncio.run(
            download_backend(
                {
                    "download_url": f"http://127.0.0.1:{self.port}/file.bin",
                    "destination": "file.bin",
                    "api_key": "wrong_key",
                },
                sandbox,
            )
        )
        assert not result.success
        assert "Backend download failed (HTTP 403)" in result.error

    def test_missing_args(self, tmp_path: Path):
        sandbox = tmp_path / "sandbox"
        sandbox.mkdir()
        result = asyncio.run(download_backend({}, sandbox))
        assert not result.success
        assert "Missing required args" in result.error
