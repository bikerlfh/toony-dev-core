# Design: `toony update` Command

## Overview

Add an `update` command to the `toony` CLI that updates an existing Toony installation to the latest version, preserving configuration and database data. Supports both remote (GitHub) and local source installations.

## Command Interface

```
toony update [--local PATH] [--no-backup]
```

- **No arguments**: uses the original installation source (stored in metadata)
- **`--local PATH`**: override source to a local repo checkout, updates metadata
- **`--no-backup`**: skip the automatic database backup before updating

## Installation Metadata

File: `~/.toony/.install-meta` (key=value format)

```
SOURCE=remote
LOCAL_PATH=
INSTALLED_AT=2026-03-23T10:00:00Z
UPDATED_AT=
```

- `SOURCE`: `remote` or `local`
- `LOCAL_PATH`: absolute path to local repo (only when `SOURCE=local`)
- `INSTALLED_AT`: timestamp of original installation
- `UPDATED_AT`: timestamp of last successful update

Written by `install.sh` at the end of installation. Read and updated by `toony update`.

## Update Flow

1. Read `.install-meta` to determine source (remote/local)
2. Verify Docker daemon is running
3. Backup database (unless `--no-backup`)
4. Download/copy new code to a temporary directory
5. Stop services (`docker compose stop`)
6. Replace `~/.toony/app/` with new code
7. Rebuild containers (`docker compose build`)
8. Start services (`docker compose up -d`)
9. Wait for healthy services (db + redis)
10. Run migrations (`manage.py migrate --noinput`)
11. Update `UPDATED_AT` in `.install-meta`
12. Reinstall CLI (copy updated `toony.sh` and `uninstall.sh`)
13. Print success summary

## Error Handling

| Failure Point | Behavior |
|---|---|
| `.install-meta` missing, no `--local` | Default to remote (GitHub main) |
| `--local PATH` invalid | Error before touching anything |
| Backup fails | Abort update |
| Build fails | Services stopped; show instructions to restart with old images |
| Migrations fail | Services running, DB may be inconsistent; show warning + backup path for manual restore |

## Files Changed

| File | Change |
|---|---|
| `toony.sh` | Add `cmd_update()` function and `update)` case in main dispatch |
| `install.sh` | Write `.install-meta` at end of `main()` |
| `uninstall.sh` | Add `rm -f "$INSTALL_DIR/.install-meta"` to cleanup |

## Implementation Notes

- `cmd_update()` in `toony.sh` needs: argument parsing (`--local`, `--no-backup`), download/copy logic, compose helpers, health check loop
- Download logic mirrors `install.sh` (`download_release` / `copy_local`) but downloads to a temp directory first before replacing `app/`
- Health check loop reuses same pattern as `install.sh` (`wait_for_services`)
- After update, the CLI script itself may have changed — step 12 copies the updated `toony.sh` from the new `app/` directory
