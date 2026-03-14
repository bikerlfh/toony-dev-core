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
import re
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
    match = re.search(r'^__version__\s*=\s*["\']([^"\']+)["\']', init_file.read_text(), re.M)
    if not match:
        print("ERROR: __version__ not found in toony_agent_runner/__init__.py")
        sys.exit(1)
    return match.group(1)


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
    if sys.version_info < REQUIRED_PYTHON:
        print(
            f"ERROR: Python {REQUIRED_PYTHON[0]}.{REQUIRED_PYTHON[1]}+ required, "
            f"found {sys.version_info.major}.{sys.version_info.minor}"
        )
        sys.exit(1)

    if not skip_obfuscation and not check_command("pyarmor"):
        print("ERROR: pyarmor not found. Install with: pip install pyarmor>=8.0")
        sys.exit(1)

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
    print("\n[2] Obfuscating with PyArmor...")
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

    # Use the wrapper entry point that has absolute imports.
    entry_point = SCRIPT_DIR / "toony_agent_runner" / "_pyinstaller_entry.py"
    paths_dir = str(SCRIPT_DIR)

    if has_pyarmor_runtime:
        # When obfuscated, create a copy of the entry point in the obfuscated dir
        # and point paths to the obfuscated source.
        obf_entry = source_dir / "toony_agent_runner" / "_pyinstaller_entry.py"
        if not obf_entry.exists():
            shutil.copy2(entry_point, obf_entry)
        entry_point = obf_entry
        paths_dir = str(source_dir)

    cmd = [
        "pyinstaller",
        "--name", "toony-agent-runner",
        f"--{variant}",
        "--strip",
        "--noupx",
        "--paths", paths_dir,
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
    original = dist_subdir / "toony-agent-runner"
    target = dist_subdir / artifact_name
    if original.exists():
        original.rename(target)
    elif not target.exists():
        print(f"WARNING: Expected artifact not found at {original}")
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

    if args.clean:
        print("\nCleaning build artifacts...")
        clean([OBFUSCATED_DIR, BUILD_DIR, DIST_DIR])
        print("Done.")
        return

    variants: list[str] = []
    if args.onefile:
        variants.append("onefile")
    if args.onedir:
        variants.append("onedir")
    if not variants:
        variants = ["onefile", "onedir"]

    print("\n[1] Validating prerequisites...")
    validate_prerequisites(args.skip_obfuscation)
    print("  All prerequisites OK.")

    version = get_version()
    os_name, arch = get_platform_info()
    artifact_name = f"toony-agent-runner-{version}-{os_name}-{arch}"
    print(f"  Version: {version}")
    print(f"  Platform: {os_name}-{arch}")
    print(f"  Artifact: {artifact_name}")
    print(f"  Variants: {', '.join(variants)}")

    source_dir = SCRIPT_DIR
    has_pyarmor_runtime = False
    if args.skip_obfuscation:
        print("\n[2] Skipping obfuscation (--skip-obfuscation)")
    else:
        source_dir = obfuscate()
        has_pyarmor_runtime = True

    artifacts: list[Path] = []
    for i, variant in enumerate(variants):
        print(f"\n[3] Building {variant} ({i + 1}/{len(variants)})...")
        artifact = build_pyinstaller(
            source_dir, variant, artifact_name, has_pyarmor_runtime,
        )
        artifacts.append(artifact)

    print("\n[4] Cleaning temp files...")
    clean([OBFUSCATED_DIR, BUILD_DIR])

    print_summary(artifacts)


if __name__ == "__main__":
    main()
