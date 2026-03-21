# Toony Backup & Restore — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `pg_dump`/`psql` backup and restore to `toony.sh`, `uninstall.sh`, and `install.sh`.

**Architecture:** A shared `do_backup` function pattern across scripts runs `pg_dump` inside the `db` container. Restore uses `psql` with a piped SQL file. The `toony.sh` CLI gets `backup` and `backup --list` commands. `uninstall.sh` prompts before teardown. `install.sh` accepts `--restore [path]`.

**Tech Stack:** Bash, `pg_dump`, `psql`, Docker Compose exec.

---

### Task 1: Add `backup` and `backup --list` commands to `toony.sh`

**Files:**
- Modify: `toony.sh`

**Step 1: Add the backup config constant and helper**

After line 7 (`ENV_FILE="$INSTALL_DIR/.env.prod"`), add:

```bash
BACKUP_DIR="$INSTALL_DIR/backups"
```

**Step 2: Add `cmd_backup` function**

After `cmd_status()` (line 50) and before `cmd_uninstall()` (line 52), add:

```bash
cmd_backup() {
    local subcmd="${1:-}"

    if [ "$subcmd" = "--list" ]; then
        if [ -d "$BACKUP_DIR" ] && ls "$BACKUP_DIR"/*.sql >/dev/null 2>&1; then
            printf "\033[1mBackups in %s:\033[0m\n\n" "$BACKUP_DIR"
            ls -lh "$BACKUP_DIR"/*.sql
        else
            info "No backups found."
        fi
        return
    fi

    # Check db container is running
    if ! compose ps db --format '{{.State}}' 2>/dev/null | grep -q "running"; then
        error "Database container is not running. Start Toony first: toony start"
    fi

    mkdir -p "$BACKUP_DIR"
    local timestamp
    timestamp=$(date +"%Y-%m-%dT%H-%M-%S")
    local backup_file="$BACKUP_DIR/toony-backup-${timestamp}.sql"

    local db_user db_name
    db_user=$(grep -E '^DB_USER=' "$ENV_FILE" | cut -d= -f2)
    db_name=$(grep -E '^DB_NAME=' "$ENV_FILE" | cut -d= -f2)

    info "Creating backup..."
    compose exec -T db pg_dump -U "$db_user" "$db_name" > "$backup_file"

    local size
    size=$(ls -lh "$backup_file" | awk '{print $5}')
    success "Backup saved to $backup_file ($size)"
}
```

**Step 3: Add `backup` to the help text**

In `cmd_help()`, after the `status` line, add:

```bash
    printf "  \033[1mbackup\033[0m      Backup the database (--list to show backups)\n"
```

**Step 4: Add `backup` to the case statement**

In the `case "$command"` block, add before the `uninstall` line:

```bash
    backup)     cmd_backup "$@" ;;
```

**Step 5: Validate syntax**

Run: `bash -n toony.sh && echo "OK"`
Expected: `OK`

---

### Task 2: Add backup prompt to `uninstall.sh`

**Files:**
- Modify: `uninstall.sh`

**Step 1: Add backup config and `warn` helper**

After the `ENV_FILE` line (line 7), add:

```bash
BACKUP_DIR="$INSTALL_DIR/backups"
```

After the `error()` helper (line 11), add:

```bash
warn()  { printf "\033[1;33m⚠\033[0m %s\n" "$1"; }
success() { printf "\033[1;32m✓\033[0m %s\n" "$1"; }
```

**Step 2: Add backup logic between confirmation and teardown**

After the confirmation block (line 29: `[[ "$confirm" =~ ^[Yy]$ ]]...`) and before the teardown comment (`# --- Teardown ---`), add:

```bash
# --- Backup ---

BACKUP_FILE=""
read -rp "Backup the database before uninstalling? [Y/n] " do_backup
do_backup="${do_backup:-Y}"

if [[ "$do_backup" =~ ^[Yy]$ ]]; then
    if [ -d "$APP_DIR" ] && [ -f "$APP_DIR/$COMPOSE_FILE" ]; then
        cd "$APP_DIR"

        # Ensure db is running
        if ! docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps db --format '{{.State}}' 2>/dev/null | grep -q "running"; then
            info "Starting database for backup..."
            docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d db
            info "Waiting for database to be ready..."
            local elapsed=0
            while [ $elapsed -lt 30 ]; do
                if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps db --format '{{.Health}}' 2>/dev/null | grep -q "healthy"; then
                    break
                fi
                sleep 2
                elapsed=$((elapsed + 2))
            done
        fi

        local db_user db_name timestamp
        db_user=$(grep -E '^DB_USER=' "$ENV_FILE" | cut -d= -f2)
        db_name=$(grep -E '^DB_NAME=' "$ENV_FILE" | cut -d= -f2)
        timestamp=$(date +"%Y-%m-%dT%H-%M-%S")

        # Save to home dir (survives rm -rf ~/.toony/)
        BACKUP_FILE="$HOME/toony-backup-${timestamp}.sql"

        info "Creating backup..."
        docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T db pg_dump -U "$db_user" "$db_name" > "$BACKUP_FILE"
        success "Backup saved to $BACKUP_FILE"
    else
        warn "Cannot backup — application files not found."
    fi
fi
```

**Step 3: Print backup location at the end**

Replace the final success line:

```bash
printf "\n\033[1;32m✓\033[0m Toony has been completely removed.\n"
```

With:

```bash
printf "\n\033[1;32m✓\033[0m Toony has been completely removed.\n"
if [ -n "$BACKUP_FILE" ] && [ -f "$BACKUP_FILE" ]; then
    local size
    size=$(ls -lh "$BACKUP_FILE" | awk '{print $5}')
    printf "\n  \033[1mBackup:\033[0m %s (%s)\n" "$BACKUP_FILE" "$size"
    printf "  Restore with: install.sh --restore %s\n\n" "$BACKUP_FILE"
fi
```

**Important:** Since `uninstall.sh` does not use functions (it runs top-level), the `local` keyword won't work outside a function. Use plain variable assignments instead (drop the `local` keyword for `elapsed`, `db_user`, `db_name`, `timestamp`, `size`).

**Step 4: Validate syntax**

Run: `bash -n uninstall.sh && echo "OK"`
Expected: `OK`

---

### Task 3: Add `--restore` flag to `install.sh`

**Files:**
- Modify: `install.sh`

**Step 1: Add restore config variable**

After the `LOCAL_DIR=""` line (line 16), add:

```bash
RESTORE_FILE=""
```

**Step 2: Add `--restore` to `parse_args`**

In the `case` block inside `parse_args()`, add before `--help`:

```bash
            --restore)
                if [ $# -ge 2 ] && [[ ! "$2" =~ ^-- ]]; then
                    RESTORE_FILE="$2"
                    [ -f "$RESTORE_FILE" ] || error "Restore file not found: $RESTORE_FILE"
                    RESTORE_FILE="$(cd "$(dirname "$RESTORE_FILE")" && pwd)/$(basename "$RESTORE_FILE")"
                    shift 2
                else
                    # Auto-detect: find most recent backup
                    RESTORE_FILE="__auto__"
                    shift
                fi
                ;;
```

**Step 3: Add `find_latest_backup` function**

After the `download()` function (line 57), add:

```bash
find_latest_backup() {
    local latest=""
    local latest_time=0

    # Search ~/.toony/backups/
    if [ -d "$INSTALL_DIR/backups" ]; then
        for f in "$INSTALL_DIR/backups"/toony-backup-*.sql; do
            [ -f "$f" ] || continue
            local mtime
            mtime=$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null || echo 0)
            if [ "$mtime" -gt "$latest_time" ]; then
                latest_time="$mtime"
                latest="$f"
            fi
        done
    fi

    # Search ~/toony-backup-*.sql
    for f in "$HOME"/toony-backup-*.sql; do
        [ -f "$f" ] || continue
        local mtime
        mtime=$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null || echo 0)
        if [ "$mtime" -gt "$latest_time" ]; then
            latest_time="$mtime"
            latest="$f"
        fi
    done

    echo "$latest"
}
```

**Step 4: Add `restore_database` function**

After `setup_database()`, add:

```bash
restore_database() {
    info "Restoring database from $RESTORE_FILE..."

    local db_user db_name
    db_user=$(grep -E '^DB_USER=' "$ENV_FILE" | cut -d= -f2)
    db_name=$(grep -E '^DB_NAME=' "$ENV_FILE" | cut -d= -f2)

    compose exec -T db psql -U "$db_user" "$db_name" < "$RESTORE_FILE"

    success "Database restored from $RESTORE_FILE"
}
```

**Step 5: Update `main()` to handle restore flow**

Replace the current `main()`:

```bash
main() {
    parse_args "$@"
    banner
    check_prerequisites
    check_existing
    prompt_user
    fetch_source
    generate_env
    build_and_start
    wait_for_services
    setup_database
    install_cli
    print_summary
}
```

With:

```bash
main() {
    parse_args "$@"
    banner
    check_prerequisites
    check_existing
    prompt_user
    fetch_source
    generate_env
    build_and_start
    wait_for_services

    if [ -n "$RESTORE_FILE" ]; then
        # Resolve auto-detect
        if [ "$RESTORE_FILE" = "__auto__" ]; then
            RESTORE_FILE=$(find_latest_backup)
            [ -n "$RESTORE_FILE" ] || error "No backup files found to restore."
            info "Found backup: $RESTORE_FILE"
        fi
        # Run migrations first (schema must exist), then restore data
        info "Running database migrations..."
        compose exec -T backend python manage.py migrate --noinput
        restore_database
    else
        setup_database
    fi

    install_cli
    print_summary
}
```

**Step 6: Update help text**

In the `--help` output inside `parse_args`, update to:

```bash
            --help|-h)
                printf "Usage: install.sh [--local PATH] [--restore [FILE]]\n\n"
                printf "Options:\n"
                printf "  --local PATH       Install from a local repo checkout instead of downloading\n"
                printf "  --restore [FILE]   Restore database from backup (auto-detects latest if no file given)\n"
                printf "  --help             Show this help\n"
                exit 0
                ;;
```

**Step 7: Validate syntax**

Run: `bash -n install.sh && echo "OK"`
Expected: `OK`

---

### Task 4: Validate all scripts

**Step 1: Syntax check all three files**

Run: `bash -n install.sh && bash -n uninstall.sh && bash -n toony.sh && echo "All OK"`
Expected: `All OK`
