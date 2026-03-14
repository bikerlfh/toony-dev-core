"""Tests for build.py utilities."""

import sys

# build.py is a standalone script, import it by path
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))
from build import (
    parse_args,
    get_version,
    get_platform_info,
    check_command,
)


class TestParseArgs:
    def test_no_args_builds_both_variants(self):
        args = parse_args([])
        assert args.onefile is False
        assert args.onedir is False
        assert args.skip_obfuscation is False
        assert args.clean is False

    def test_onefile_only(self):
        args = parse_args(["--onefile"])
        assert args.onefile is True
        assert args.onedir is False

    def test_onedir_only(self):
        args = parse_args(["--onedir"])
        assert args.onedir is True
        assert args.onefile is False

    def test_skip_obfuscation(self):
        args = parse_args(["--skip-obfuscation"])
        assert args.skip_obfuscation is True

    def test_clean(self):
        args = parse_args(["--clean"])
        assert args.clean is True


class TestGetVersion:
    def test_reads_version_from_init(self):
        version = get_version()
        # Should match the version in toony_agent_runner/__init__.py
        assert version  # non-empty string
        assert "." in version  # looks like semver


class TestGetPlatformInfo:
    def test_returns_os_and_arch(self):
        os_name, arch = get_platform_info()
        assert os_name in ("darwin", "linux", "windows")
        assert arch  # non-empty


class TestCheckCommand:
    def test_existing_command(self):
        # python should always exist
        assert check_command("python3") is True

    def test_missing_command(self):
        assert check_command("nonexistent_tool_xyz_123") is False
