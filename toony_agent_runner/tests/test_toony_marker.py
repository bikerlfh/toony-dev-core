"""Tests for the TOONY marker protocol (extract_toony_marker)."""

import pytest

from toony_agent_runner.cli_executor import extract_toony_marker


class TestExtractToonyMarker:
    """Unit tests for extract_toony_marker()."""

    def test_no_marker_returns_none(self):
        """Plain text without a marker returns (None, original_text)."""
        text = "Here is a normal response with no markers."
        marker, cleaned = extract_toony_marker(text)
        assert marker is None
        assert cleaned == text

    def test_question_free_text(self):
        """A question marker with type=free_text is extracted and stripped."""
        payload = '{"action":"question","text":"What is the DB host?","type":"free_text"}'
        text = f"Some preamble.\n<!--TOONY:{payload}-->\nSome epilogue."
        marker, cleaned = extract_toony_marker(text)

        assert marker is not None
        assert marker["action"] == "question"
        assert marker["text"] == "What is the DB host?"
        assert marker["type"] == "free_text"
        assert "<!--TOONY:" not in cleaned
        assert "Some preamble." in cleaned
        assert "Some epilogue." in cleaned

    def test_question_with_options(self):
        """A question marker with options, header, and multi_select is parsed."""
        payload = (
            '{"action":"question","text":"Pick a DB",'
            '"header":"Database Selection",'
            '"options":["postgres","mysql","sqlite"],'
            '"multi_select":true}'
        )
        text = f"<!--TOONY:{payload}-->"
        marker, cleaned = extract_toony_marker(text)

        assert marker is not None
        assert marker["action"] == "question"
        assert marker["header"] == "Database Selection"
        assert marker["options"] == ["postgres", "mysql", "sqlite"]
        assert marker["multi_select"] is True
        assert cleaned == ""

    def test_finish_with_summary(self):
        """A finish marker with a summary is extracted."""
        payload = '{"action":"finish","summary":"All tasks completed successfully."}'
        text = f"Done!\n<!--TOONY:{payload}-->"
        marker, cleaned = extract_toony_marker(text)

        assert marker is not None
        assert marker["action"] == "finish"
        assert marker["summary"] == "All tasks completed successfully."
        assert "Done!" in cleaned
        assert "<!--TOONY:" not in cleaned

    def test_finish_without_summary(self):
        """A finish marker without a summary is extracted."""
        payload = '{"action":"finish"}'
        text = f"<!--TOONY:{payload}-->"
        marker, cleaned = extract_toony_marker(text)

        assert marker is not None
        assert marker["action"] == "finish"
        assert "summary" not in marker
        assert cleaned == ""

    def test_invalid_json_returns_none(self):
        """Invalid JSON inside the marker returns (None, original_text)."""
        text = "<!--TOONY:not-valid-json-->"
        marker, cleaned = extract_toony_marker(text)
        assert marker is None
        assert cleaned == text

    def test_missing_action_returns_none(self):
        """JSON without an 'action' key returns (None, original_text)."""
        text = '<!--TOONY:{"foo":"bar"}-->'
        marker, cleaned = extract_toony_marker(text)
        assert marker is None
        assert cleaned == text

    def test_marker_in_middle_of_text(self):
        """A marker between text blocks is extracted; surrounding text preserved."""
        payload = '{"action":"question","text":"Continue?"}'
        text = f"Before marker.<!--TOONY:{payload}-->After marker."
        marker, cleaned = extract_toony_marker(text)

        assert marker is not None
        assert marker["action"] == "question"
        assert marker["text"] == "Continue?"
        assert cleaned == "Before marker.After marker."

    def test_question_defaults(self):
        """A question marker missing 'type' still parses; type key is absent."""
        payload = '{"action":"question","text":"Your name?"}'
        text = f"<!--TOONY:{payload}-->"
        marker, cleaned = extract_toony_marker(text)

        assert marker is not None
        assert marker["action"] == "question"
        assert marker["text"] == "Your name?"
        # type key not present — caller should default to free_text
        assert "type" not in marker
