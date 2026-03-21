# Toony Backup & Restore — Design

## Overview

Add database backup/restore capabilities to the self-hosted installer scripts. Backups use `pg_dump` inside the `db` container. Restore uses `psql`.

## Decisions

| Decision | Choice |
|---|---|
| Backup location | `~/.toony/backups/` (manual backups), `~/` (uninstall backup) |
| Backup format | SQL plain text via `pg_dump` |
| Naming | `toony-backup-YYYY-MM-DDTHH-MM-SS.sql` |
| Uninstall behavior | Prompt user before deleting (default: yes) |
| Restore in install | `--restore` (latest auto-detect) or `--restore /path/to/file.sql` |
| CLI commands | `toony backup`, `toony backup --list` |

## Backup Mechanism

- Runs `pg_dump -U $DB_USER $DB_NAME` inside the `db` container
- Output piped to `~/.toony/backups/toony-backup-<timestamp>.sql`
- Requires `db` container to be running

## Changes by File

### `toony.sh` — new commands

```bash
toony backup            # creates backup at ~/.toony/backups/
toony backup --list     # lists existing backups with size and date
```

- `backup`: creates `~/.toony/backups/` if needed, runs `pg_dump` via `docker compose exec`, prints the path
- `backup --list`: lists `~/.toony/backups/*.sql` with `ls -lh`, or "No backups found"

### `uninstall.sh` — backup prompt before teardown

After the "Continue? [y/N]" confirmation, adds:

```
Do you want to backup the database before uninstalling? [Y/n]
```

- Default is **yes** (pressing Enter creates the backup)
- If yes: runs backup, copies the file to `~/toony-backup-<timestamp>.sql` (outside `~/.toony/` so it survives `rm -rf`)
- If the `db` container is not running, starts it temporarily with `docker compose up -d db` and waits for healthy
- At the end of the uninstall, prints: `Backup saved to ~/toony-backup-<timestamp>.sql`

### `install.sh` — `--restore` flag

```bash
install.sh --local . --restore                                # auto-detect latest
install.sh --local . --restore ~/toony-backup-2026-03-21.sql  # specific file
```

- `--restore` without path: searches for most recent `.sql` file in `~/.toony/backups/` and `~/toony-backup-*.sql`
- `--restore /path`: uses the specified file, errors if it doesn't exist
- Restore runs after migrations: `psql -U $DB_USER $DB_NAME < backup.sql` inside the `db` container
- Skips superuser creation if restoring (user already exists in the backup)

### Backup file lifecycle

- **Manual backups** (`toony backup`): stored in `~/.toony/backups/`, deleted with uninstall
- **Uninstall backups**: copied to `~/toony-backup-<timestamp>.sql`, survives uninstall
- **Restore**: works with files from either location
