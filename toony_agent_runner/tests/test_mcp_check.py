# tests/test_mcp_check.py
"""Tests for MCP installation check at runner startup."""

from __future__ import annotations

from unittest.mock import patch, MagicMock

from toony_agent_runner.main import _derive_api_url, _ensure_mcp_installed, MCP_INSTALL_DIR
from toony_agent_runner.config import RunnerConfig


class TestDeriveApiUrl:
    def test_ws_to_http(self):
        assert _derive_api_url("ws://localhost:8000/ws/toony-agents/runner/") == "http://localhost:8000/api"

    def test_wss_to_https(self):
        assert _derive_api_url("wss://example.com:443/ws/toony-agents/runner/") == "https://example.com:443/api"

    def test_custom_port(self):
        assert _derive_api_url("ws://192.168.1.10:9000/ws/path/") == "http://192.168.1.10:9000/api"


class TestEnsureMcpInstalled:
    def test_skips_if_already_installed(self, tmp_path):
        with patch.object(MCP_INSTALL_DIR.__class__, "exists", return_value=True) as mock_exists:
            with patch("toony_agent_runner.main.subprocess.run") as mock_run:
                _ensure_mcp_installed(RunnerConfig(api_key="tok_test"))
                mock_run.assert_not_called()

    def test_runs_installer_when_missing(self, tmp_path):
        config = RunnerConfig(
            backend_url="ws://localhost:8000/ws/toony-agents/runner/",
            api_key="tok_test_key",
        )
        mock_result = MagicMock()
        mock_result.returncode = 0

        with patch("toony_agent_runner.main.MCP_INSTALL_DIR") as mock_dir:
            mock_dir.exists.return_value = False
            with patch("toony_agent_runner.main.subprocess.run", return_value=mock_result) as mock_run:
                _ensure_mcp_installed(config)

                mock_run.assert_called_once()
                call_kwargs = mock_run.call_args
                env = call_kwargs.kwargs["env"]
                assert env["TOONY_API_URL"] == "http://localhost:8000/api"
                assert env["TOONY_API_KEY"] == "tok_test_key"

    def test_exits_on_install_failure(self):
        config = RunnerConfig(
            backend_url="ws://localhost:8000/ws/toony-agents/runner/",
            api_key="tok_test_key",
        )
        mock_result = MagicMock()
        mock_result.returncode = 1

        with patch("toony_agent_runner.main.MCP_INSTALL_DIR") as mock_dir:
            mock_dir.exists.return_value = False
            with patch("toony_agent_runner.main.subprocess.run", return_value=mock_result):
                import pytest
                with pytest.raises(SystemExit) as exc_info:
                    _ensure_mcp_installed(config)
                assert exc_info.value.code == 1
