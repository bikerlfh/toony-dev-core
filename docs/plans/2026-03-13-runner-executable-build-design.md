# Runner Executable Build Script Design

**Date:** 2026-03-13
**Status:** Approved

## Goal

Create a `build.py` script that produces standalone executables of `toony_agent_runner` using PyArmor (code obfuscation) + PyInstaller (packaging). The executables are intended for distribution to external clients who should not have access to the source code.

## Decisions

| Aspect | Decision |
|---|---|
| **File** | `build.py` at `toony_agent_runner/` root (beside `pyproject.toml`) |
| **CLI** | `--onefile`, `--onedir`, `--skip-obfuscation`, `--clean` (no flags = both variants) |
| **Obfuscation** | PyArmor 8+ with `--restrict --private` |
| **Packaging** | PyInstaller 6+ with `--strip --noupx` |
| **Platforms** | macOS (darwin) + Linux |
| **Python** | Fixed to 3.11 |
| **Version** | Read from `__init__.py`, included in artifact name |
| **Artifact naming** | `toony-agent-runner-{version}-{os}-{arch}` |
| **Output** | `dist/onefile/` and `dist/onedir/` |
| **Temp dirs** | `_obfuscated/` and `build/` (auto-cleaned) |
| **Validation** | Verifies python, pyarmor, and pyinstaller before starting |
| **Error handling** | Aborts on first subprocess failure with clear stderr |

## CLI Interface

```
python build.py                    # Build both variants (onefile + onedir)
python build.py --onefile          # Only onefile
python build.py --onedir           # Only onedir
python build.py --skip-obfuscation # PyInstaller only, no PyArmor (for debugging)
python build.py --clean            # Clean previous build artifacts
```

## Output Structure

```
dist/
├── onefile/
│   └── toony-agent-runner-0.3.0-darwin-arm64
├── onedir/
│   └── toony-agent-runner-0.3.0-darwin-arm64/
│       ├── toony-agent-runner
│       └── ... (dependencies)
```

## Build Pipeline

```
1. Validate prerequisites
   ├── Python >= 3.11
   ├── pyarmor CLI on PATH
   └── pyinstaller CLI on PATH

2. Read version
   └── Import __version__ from toony_agent_runner/__init__.py

3. Clean temp directories
   └── Remove _obfuscated/, build/ from previous runs

4. Obfuscate with PyArmor (unless --skip-obfuscation)
   ├── pyarmor gen --restrict --private -O _obfuscated toony_agent_runner/
   └── Result: _obfuscated/toony_agent_runner/ with protected bytecode

5. Build with PyInstaller (per requested variant)
   ├── Entry point: _obfuscated/toony_agent_runner/main.py (or original if --skip-obfuscation)
   ├── --name toony-agent-runner
   ├── --hidden-import websockets, websockets.asyncio, yaml
   ├── --add-data for PyArmor runtime files (pyarmor_runtime)
   ├── --onefile → dist/onefile/
   ├── --onedir  → dist/onedir/
   └── --strip (reduce size on macOS/Linux)

6. Rename artifacts
   └── Append version + platform + arch to name
       e.g., toony-agent-runner-0.3.0-darwin-arm64

7. Clean temp files
   └── Remove _obfuscated/ and build/

8. Summary
   └── Print artifact paths + sizes
```

## PyArmor Command

```bash
pyarmor gen \
  --restrict \
  --private \
  --output _obfuscated \
  toony_agent_runner/
```

- `--restrict`: Prevents obfuscated modules from being imported externally
- `--private`: Scripts cannot be copied to another environment and executed

## PyInstaller Command (per variant)

```bash
pyinstaller \
  --name toony-agent-runner \
  --onefile \
  --strip \
  --noupx \
  --distpath dist/onefile \
  --workpath build \
  --specpath build \
  --hidden-import websockets \
  --hidden-import websockets.asyncio \
  --hidden-import yaml \
  --add-data "_obfuscated/pyarmor_runtime_*:pyarmor_runtime_*" \
  --collect-all pyarmor_runtime \
  _obfuscated/toony_agent_runner/main.py
```

- `--noupx`: Avoids UPX compression that can interfere with PyArmor obfuscation
- `--strip`: Reduces binary size (macOS/Linux only)
- Path separator is `:` on macOS/Linux

## Build Dependencies

Not added to `pyproject.toml` (build-only, not runtime):

```
pyinstaller>=6.0
pyarmor>=8.0
```

The script prints install instructions if either is missing.

## Platform Detection

Uses `platform.system().lower()` (darwin/linux) and `platform.machine()` (arm64/x86_64) for artifact naming.
