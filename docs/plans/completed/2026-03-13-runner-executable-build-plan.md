# Runner Executable Build Script Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create `build.py` in `toony_agent_runner/` that uses PyArmor + PyInstaller to produce obfuscated standalone executables for macOS and Linux.

**Architecture:** Single `build.py` script that orchestrates: validate prerequisites -> read version -> obfuscate with PyArmor -> package with PyInstaller -> rename artifacts with version/platform/arch -> clean temp files.

**Tech Stack:** Python 3.11, PyArmor 8+, PyInstaller 6+, subprocess, argparse, platform, shutil

**Design doc:** `docs/plans/2026-03-13-runner-executable-build-design.md`

---

### Task 1: Update .gitignore for build artifacts

**Files:**
- Modify: `.gitignore`

**Step 1: Add build artifact patterns to .gitignore**

Add after the `# Python` section:

```gitignore
# Build artifacts (PyInstaller / PyArmor)
dist/
build/
_obfuscated/
*.spec
```

**Step 2: Verify patterns are correct**

Run: `git diff .gitignore`
Expected: 4 new lines added under a "Build artifacts" comment.

**Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: add build artifact directories to .gitignore"
```

---

### Task 2: Create build.py with CLI argument parsing and prerequisite validation

**Files:**
- Create: `toony_agent_runner/build.py`
- Test: `toony_agent_runner/tests/test_build.py`

**Step 1: Write the failing test**

Create `toony_agent_runner/tests/test_build.py`:

```python
"""Tests for build.py utilities."""

import sys
from unittest.mock import patch

import pytest

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
```

**Step 2: Run test to verify it fails**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_build.py -v`
Expected: FAIL — `ModuleNotFoundError` or `ImportError` because `build.py` does not exist yet.

**Step 3: Write the build.py skeleton with CLI parsing and validation functions**

Create `toony_agent_runner/build.py`:

```python
#!/usr/bin/env python3
"""
Build script for toony-agent-runner executable.

Uses PyArmor for code obfuscation and PyInstaller for packaging.

Usage:
    python build.py                    # Build both variants (onefile + onedir)
    python build.py --onefile          # Only onefile
    python build.py --onedir           # Only onedir
    python build.py --skip-obfuscation # PyInstaller only, no PyArmor (for debug)
    python build.py --clean            # Clean previous build artifacts
"""

from __future__ import annotations

import argparse
import platform
import shutil
import subprocess
import sys
from pathlib import Path

# Directories (relative to this script's location)
SCRIPT_DIR = Path(__file__).resolve().parent
PACKAGE_DIR = SCRIPT_DIR / "toony_agent_runner"
OBFUSCATED_DIR = SCRIPT_DIR / "_obfuscated"
BUILD_DIR = SCRIPT_DIR / "build"
DIST_DIR = SCRIPT_DIR / "dist"

REQUIRED_PYTHON = (3, 11)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Build toony-agent-runner standalone executable",
    )
    parser.add_argument(
        "--onefile",
        action="store_true",
        help="Build only the single-file executable",
    )
    parser.add_argument(
        "--onedir",
        action="store_true",
        help="Build only the one-directory bundle",
    )
    parser.add_argument(
        "--skip-obfuscation",
        action="store_true",
        help="Skip PyArmor obfuscation (for debugging)",
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Clean all build artifacts and exit",
    )
    return parser.parse_args(argv)


def get_version() -> str:
    """Read __version__ from toony_agent_runner/__init__.py."""
    init_file = PACKAGE_DIR / "__init__.py"
    namespace: dict[str, str] = {}
    exec(init_file.read_text(), namespace)  # noqa: S102
    return namespace["__version__"]


def get_platform_info() -> tuple[str, str]:
    """Return (os_name, architecture) for artifact naming."""
    os_name = platform.system().lower()
    arch = platform.machine()
    return os_name, arch


def check_command(name: str) -> bool:
    """Check if a command is available on PATH."""
    return shutil.which(name) is not None


def validate_prerequisites(skip_obfuscation: bool) -> None:
    """Validate that all required tools are available."""
    # Check Python version.
    if sys.version_info < REQUIRED_PYTHON:
        print(
            f"ERROR: Python {REQUIRED_PYTHON[0]}.{REQUIRED_PYTHON[1]}+ required, "
            f"found {sys.version_info.major}.{sys.version_info.minor}"
        )
        sys.exit(1)

    # Check PyArmor.
    if not skip_obfuscation and not check_command("pyarmor"):
        print("ERROR: pyarmor not found. Install with: pip install pyarmor>=8.0")
        sys.exit(1)

    # Check PyInstaller.
    if not check_command("pyinstaller"):
        print("ERROR: pyinstaller not found. Install with: pip install pyinstaller>=6.0")
        sys.exit(1)


def clean(dirs: list[Path]) -> None:
    """Remove build artifact directories."""
    for d in dirs:
        if d.exists():
            print(f"  Removing {d.relative_to(SCRIPT_DIR)}/")
            shutil.rmtree(d)


def run_cmd(cmd: list[str], label: str) -> None:
    """Run a subprocess command, abort on failure."""
    print(f"  Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=str(SCRIPT_DIR), capture_output=True, text=True)
    if result.returncode != 0:
        print(f"ERROR: {label} failed (exit code {result.returncode})")
        if result.stderr:
            print(result.stderr)
        sys.exit(1)


def obfuscate() -> Path:
    """Run PyArmor to obfuscate the package. Returns path to obfuscated code."""
    print("\n[2/5] Obfuscating with PyArmor...")
    clean([OBFUSCATED_DIR])
    run_cmd(
        [
            "pyarmor", "gen",
            "--restrict",
            "--private",
            "--output", str(OBFUSCATED_DIR),
            str(PACKAGE_DIR),
        ],
        "PyArmor obfuscation",
    )
    return OBFUSCATED_DIR


def build_pyinstaller(
    source_dir: Path,
    variant: str,
    artifact_name: str,
    has_pyarmor_runtime: bool,
) -> Path:
    """Run PyInstaller for a single variant (onefile or onedir)."""
    dist_subdir = DIST_DIR / variant
    entry_point = source_dir / "toony_agent_runner" / "main.py"

    if not has_pyarmor_runtime:
        # When skipping obfuscation, point directly to the package.
        entry_point = PACKAGE_DIR / "main.py"

    cmd = [
        "pyinstaller",
        "--name", "toony-agent-runner",
        f"--{variant}",
        "--strip",
        "--noupx",
        "--distpath", str(dist_subdir),
        "--workpath", str(BUILD_DIR),
        "--specpath", str(BUILD_DIR),
        "--hidden-import", "websockets",
        "--hidden-import", "websockets.asyncio",
        "--hidden-import", "yaml",
    ]

    # Include PyArmor runtime if obfuscation was applied.
    if has_pyarmor_runtime:
        runtime_dirs = list(source_dir.glob("pyarmor_runtime_*"))
        for runtime_dir in runtime_dirs:
            cmd.extend([
                "--add-data", f"{runtime_dir}:{runtime_dir.name}",
            ])

    cmd.append(str(entry_point))
    run_cmd(cmd, f"PyInstaller ({variant})")

    # Rename artifact to include version + platform + arch.
    if variant == "onefile":
        original = dist_subdir / "toony-agent-runner"
        target = dist_subdir / artifact_name
        if original.exists():
            original.rename(target)
        return target
    else:
        original = dist_subdir / "toony-agent-runner"
        target = dist_subdir / artifact_name
        if original.exists():
            original.rename(target)
        return target


def print_summary(artifacts: list[Path]) -> None:
    """Print summary of generated artifacts with sizes."""
    print("\n" + "=" * 60)
    print("BUILD COMPLETE")
    print("=" * 60)
    for artifact in artifacts:
        if artifact.is_file():
            size_mb = artifact.stat().st_size / (1024 * 1024)
            print(f"  {artifact.relative_to(SCRIPT_DIR)}  ({size_mb:.1f} MB)")
        elif artifact.is_dir():
            total = sum(f.stat().st_size for f in artifact.rglob("*") if f.is_file())
            size_mb = total / (1024 * 1024)
            print(f"  {artifact.relative_to(SCRIPT_DIR)}/  ({size_mb:.1f} MB)")
    print("=" * 60)


def main() -> None:
    """Main build entry point."""
    args = parse_args()

    print("=" * 60)
    print("toony-agent-runner build")
    print("=" * 60)

    # Clean mode.
    if args.clean:
        print("\nCleaning build artifacts...")
        clean([OBFUSCATED_DIR, BUILD_DIR, DIST_DIR])
        print("Done.")
        return

    # Determine variants to build.
    variants: list[str] = []
    if args.onefile:
        variants.append("onefile")
    if args.onedir:
        variants.append("onedir")
    if not variants:
        variants = ["onefile", "onedir"]

    # Step 1: Validate prerequisites.
    print("\n[1/5] Validating prerequisites...")
    validate_prerequisites(args.skip_obfuscation)
    print("  All prerequisites OK.")

    # Read version and platform info.
    version = get_version()
    os_name, arch = get_platform_info()
    artifact_name = f"toony-agent-runner-{version}-{os_name}-{arch}"
    print(f"  Version: {version}")
    print(f"  Platform: {os_name}-{arch}")
    print(f"  Artifact: {artifact_name}")
    print(f"  Variants: {', '.join(variants)}")

    # Step 2: Obfuscate (unless skipped).
    source_dir = SCRIPT_DIR
    has_pyarmor_runtime = False
    if args.skip_obfuscation:
        print("\n[2/5] Skipping obfuscation (--skip-obfuscation)")
    else:
        source_dir = obfuscate()
        has_pyarmor_runtime = True

    # Step 3: Build with PyInstaller.
    artifacts: list[Path] = []
    for i, variant in enumerate(variants):
        print(f"\n[3/5] Building {variant} ({i + 1}/{len(variants)})...")
        artifact = build_pyinstaller(
            source_dir, variant, artifact_name, has_pyarmor_runtime,
        )
        artifacts.append(artifact)

    # Step 4: Clean temp files.
    print("\n[4/5] Cleaning temp files...")
    clean([OBFUSCATED_DIR, BUILD_DIR])

    # Step 5: Summary.
    print_summary(artifacts)


if __name__ == "__main__":
    main()
```

**Step 4: Run tests to verify they pass**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/test_build.py -v`
Expected: All 7 tests PASS.

**Step 5: Commit**

```bash
git add toony_agent_runner/build.py toony_agent_runner/tests/test_build.py
git commit -m "feat(runner): add build.py for PyArmor + PyInstaller executable build"
```

---

### Task 3: Smoke test the build script (manual verification)

**Files:**
- None (manual test)

**Step 1: Install build dependencies**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pip install pyinstaller>=6.0 pyarmor>=8.0`

**Step 2: Test --clean flag**

Run: `cd toony_agent_runner && PYENV_VERSION=toony_agent_runner_venv pyenv exec python build.py --clean`
Expected: "Cleaning build artifacts... Done." (no errors even if dirs don't exist)

**Step 3: Test prerequisite validation**

Run: `cd toony_agent_runner && PYENV_VERSION=toony_agent_runner_venv pyenv exec python build.py --skip-obfuscation --onefile`
Expected: Build proceeds through all steps, generates `dist/onefile/toony-agent-runner-0.3.0-darwin-arm64` (or your current arch).

**Step 4: Test full build with obfuscation**

Run: `cd toony_agent_runner && PYENV_VERSION=toony_agent_runner_venv pyenv exec python build.py --onefile`
Expected: PyArmor obfuscates, then PyInstaller packages. Artifact appears in `dist/onefile/`.

**Step 5: Verify the executable runs**

Run: `./dist/onefile/toony-agent-runner-0.3.0-darwin-arm64 --help`
Expected: Shows the argument help for toony-agent-runner (--config, --verbose).

**Step 6: Clean up after testing**

Run: `cd toony_agent_runner && PYENV_VERSION=toony_agent_runner_venv pyenv exec python build.py --clean`

**Step 7: Commit .gitignore update**

```bash
git add .gitignore
git commit -m "chore: add build artifact directories to .gitignore"
```

---

### Task 4: Fix any issues found during smoke test

**Files:**
- Modify: `toony_agent_runner/build.py` (as needed)
- Modify: `toony_agent_runner/tests/test_build.py` (as needed)

**Step 1: Address PyArmor runtime inclusion issues**

If PyInstaller can't find `pyarmor_runtime`, adjust the `--add-data` and `--collect-all` flags in `build_pyinstaller()`. The PyArmor runtime directory name includes a hash (e.g., `pyarmor_runtime_000000`) that must be discovered dynamically via glob.

**Step 2: Address hidden import issues**

If the executable crashes with `ModuleNotFoundError`, add missing modules to the `--hidden-import` list in `build_pyinstaller()`. Common candidates:
- `websockets.asyncio.client`
- `websockets.legacy`
- `_yaml` (C extension for PyYAML)

**Step 3: Run full test suite to verify nothing broke**

Run: `PYENV_VERSION=toony_agent_runner_venv pyenv exec pytest toony_agent_runner/tests/ -v`
Expected: All tests pass (existing + new).

**Step 4: Commit fixes**

```bash
git add toony_agent_runner/build.py toony_agent_runner/tests/test_build.py
git commit -m "fix(runner): resolve build.py issues found during smoke test"
```
