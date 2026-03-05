"""Tests for filesystem commands."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from toony_agent_runner.commands.filesystem import (
    create_dir,
    create_file,
    move_file,
    rename_file,
    copy_file,
)


# ---------------------------------------------------------------------------
# create_dir
# ---------------------------------------------------------------------------


class TestCreateDir:
    def test_creates_directory(self, tmp_path: Path):
        result = asyncio.run(create_dir({"path": "mydir"}, tmp_path))
        assert result.success is True
        assert (tmp_path / "mydir").is_dir()

    def test_creates_nested_directories(self, tmp_path: Path):
        result = asyncio.run(create_dir({"path": "a/b/c"}, tmp_path))
        assert result.success is True
        assert (tmp_path / "a" / "b" / "c").is_dir()

    def test_existing_directory_ok(self, tmp_path: Path):
        (tmp_path / "existing").mkdir()
        result = asyncio.run(create_dir({"path": "existing"}, tmp_path))
        assert result.success is True
        assert (tmp_path / "existing").is_dir()

    def test_traversal_blocked(self, tmp_path: Path):
        result = asyncio.run(create_dir({"path": "../../escape"}, tmp_path))
        assert result.success is False
        assert "escapes sandbox" in result.error

    def test_missing_path(self, tmp_path: Path):
        result = asyncio.run(create_dir({}, tmp_path))
        assert result.success is False
        assert "Missing required arg: path" in result.error


# ---------------------------------------------------------------------------
# create_file
# ---------------------------------------------------------------------------


class TestCreateFile:
    def test_creates_empty_file(self, tmp_path: Path):
        result = asyncio.run(create_file({"path": "empty.txt"}, tmp_path))
        assert result.success is True
        target = tmp_path / "empty.txt"
        assert target.exists()
        assert target.read_text() == ""

    def test_creates_file_with_content(self, tmp_path: Path):
        result = asyncio.run(
            create_file({"path": "hello.txt", "content": "Hello, World!"}, tmp_path)
        )
        assert result.success is True
        assert (tmp_path / "hello.txt").read_text() == "Hello, World!"

    def test_creates_parent_directories(self, tmp_path: Path):
        result = asyncio.run(
            create_file({"path": "deep/nested/file.py", "content": "# code"}, tmp_path)
        )
        assert result.success is True
        assert (tmp_path / "deep" / "nested" / "file.py").read_text() == "# code"

    def test_missing_path(self, tmp_path: Path):
        result = asyncio.run(create_file({}, tmp_path))
        assert result.success is False
        assert "Missing required arg: path" in result.error

    def test_traversal_blocked(self, tmp_path: Path):
        result = asyncio.run(
            create_file({"path": "../../../etc/evil"}, tmp_path)
        )
        assert result.success is False
        assert "escapes sandbox" in result.error


# ---------------------------------------------------------------------------
# move_file
# ---------------------------------------------------------------------------


class TestMoveFile:
    def test_moves_file(self, tmp_path: Path):
        src = tmp_path / "a.txt"
        src.write_text("data")
        result = asyncio.run(
            move_file({"source": "a.txt", "destination": "b.txt"}, tmp_path)
        )
        assert result.success is True
        assert not src.exists()
        assert (tmp_path / "b.txt").read_text() == "data"

    def test_moves_to_subdir(self, tmp_path: Path):
        src = tmp_path / "a.txt"
        src.write_text("data")
        (tmp_path / "sub").mkdir()
        result = asyncio.run(
            move_file({"source": "a.txt", "destination": "sub/a.txt"}, tmp_path)
        )
        assert result.success is True
        assert (tmp_path / "sub" / "a.txt").read_text() == "data"

    def test_source_not_found(self, tmp_path: Path):
        result = asyncio.run(
            move_file({"source": "nope.txt", "destination": "dest.txt"}, tmp_path)
        )
        assert result.success is False
        assert "Source not found" in result.error

    def test_missing_args(self, tmp_path: Path):
        result = asyncio.run(move_file({"source": "a.txt"}, tmp_path))
        assert result.success is False
        assert "Missing required args" in result.error

    def test_traversal_blocked(self, tmp_path: Path):
        src = tmp_path / "a.txt"
        src.write_text("data")
        result = asyncio.run(
            move_file({"source": "a.txt", "destination": "../../escape"}, tmp_path)
        )
        assert result.success is False
        assert "escapes sandbox" in result.error


# ---------------------------------------------------------------------------
# rename_file
# ---------------------------------------------------------------------------


class TestRenameFile:
    def test_renames_file(self, tmp_path: Path):
        src = tmp_path / "old.txt"
        src.write_text("content")
        result = asyncio.run(
            rename_file({"path": "old.txt", "new_name": "new.txt"}, tmp_path)
        )
        assert result.success is True
        assert not src.exists()
        assert (tmp_path / "new.txt").read_text() == "content"

    def test_rename_in_subdir(self, tmp_path: Path):
        sub = tmp_path / "sub"
        sub.mkdir()
        src = sub / "old.txt"
        src.write_text("data")
        result = asyncio.run(
            rename_file({"path": "sub/old.txt", "new_name": "new.txt"}, tmp_path)
        )
        assert result.success is True
        assert not src.exists()
        assert (sub / "new.txt").read_text() == "data"

    def test_source_not_found(self, tmp_path: Path):
        result = asyncio.run(
            rename_file({"path": "nope.txt", "new_name": "new.txt"}, tmp_path)
        )
        assert result.success is False
        assert "Source not found" in result.error

    def test_missing_args(self, tmp_path: Path):
        result = asyncio.run(rename_file({"path": "a.txt"}, tmp_path))
        assert result.success is False
        assert "Missing required args" in result.error

    def test_new_name_traversal_blocked(self, tmp_path: Path):
        src = tmp_path / "a.txt"
        src.write_text("data")
        result = asyncio.run(
            rename_file({"path": "a.txt", "new_name": "../../escape"}, tmp_path)
        )
        assert result.success is False
        assert "escapes sandbox" in result.error


# ---------------------------------------------------------------------------
# copy_file
# ---------------------------------------------------------------------------


class TestCopyFile:
    def test_copies_file(self, tmp_path: Path):
        src = tmp_path / "a.txt"
        src.write_text("copy me")
        result = asyncio.run(
            copy_file({"source": "a.txt", "destination": "b.txt"}, tmp_path)
        )
        assert result.success is True
        assert src.read_text() == "copy me"  # source still exists
        assert (tmp_path / "b.txt").read_text() == "copy me"

    def test_copies_directory(self, tmp_path: Path):
        src_dir = tmp_path / "srcdir"
        src_dir.mkdir()
        (src_dir / "file.txt").write_text("inside")
        result = asyncio.run(
            copy_file({"source": "srcdir", "destination": "dstdir"}, tmp_path)
        )
        assert result.success is True
        assert (tmp_path / "dstdir" / "file.txt").read_text() == "inside"

    def test_source_not_found(self, tmp_path: Path):
        result = asyncio.run(
            copy_file({"source": "nope.txt", "destination": "dest.txt"}, tmp_path)
        )
        assert result.success is False
        assert "Source not found" in result.error

    def test_missing_args(self, tmp_path: Path):
        result = asyncio.run(copy_file({}, tmp_path))
        assert result.success is False
        assert "Missing required args" in result.error

    def test_traversal_blocked(self, tmp_path: Path):
        src = tmp_path / "a.txt"
        src.write_text("data")
        result = asyncio.run(
            copy_file({"source": "a.txt", "destination": "../../escape"}, tmp_path)
        )
        assert result.success is False
        assert "escapes sandbox" in result.error

    def test_copies_file_creates_parent_dirs(self, tmp_path: Path):
        src = tmp_path / "a.txt"
        src.write_text("data")
        result = asyncio.run(
            copy_file({"source": "a.txt", "destination": "deep/nested/b.txt"}, tmp_path)
        )
        assert result.success is True
        assert (tmp_path / "deep" / "nested" / "b.txt").read_text() == "data"
