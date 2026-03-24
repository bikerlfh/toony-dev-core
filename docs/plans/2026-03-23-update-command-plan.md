# `toony update` Command — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `toony update` command that updates an existing installation from GitHub or a local checkout, with automatic DB backup and installation metadata tracking.

**Architecture:** `install.sh` writes a `.install-meta` file recording the installation source. `toony.sh` gains a `cmd_update()` function that reads that metadata, backs up the DB, fetches new code to a temp dir, swaps it in, rebuilds containers, runs migrations, and reinstalls the CLI scripts.

**Tech Stack:** Bash, Docker Compose, rsync, curl/wget

---

### Task 1: Add `.install-meta` writing to `install.sh`

**Files:**
- Modify: `install.sh:8-17` (add META_FILE variable)
- Modify: `install.sh:456-484` (write metadata at end of main)

**Step 1: Add META_FILE config variable**

In `install.sh`, add a new variable after line 14 (`ENV_FILE`):

```bash
# Line 14 currently:
ENV_FILE="$INSTALL_DIR/.env.prod"
# Add after it:
META_FILE="$INSTALL_DIR/.install-meta"
```

**Step 2: Add `write_meta()` function**

Add this function after `install_cli()` (after line 391), before the success summary section:

```bash
# ──────────────────────────────────────────────
# Write installation metadata
# ──────────────────────────────────────────────

write_meta() {
    local source="remote"
    local local_path=""

    if [ -n "$LOCAL_DIR" ]; then
        source="local"
        local_path="$LOCAL_DIR"
    fi

    cat > "$META_FILE" <<EOF
SOURCE=$source
LOCAL_PATH=$local_path
INSTALLED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
UPDATED_AT=
EOF

    success "Installation metadata saved."
}
```

**Step 3: Call `write_meta()` in `main()`**

In the `main()` function, add `write_meta` call after `install_cli` (line 482):

```bash
    install_cli
    write_meta
    print_summary
```

**Step 4: Verify**

Run: `cat install.sh | grep -n 'META_FILE\|write_meta\|install-meta'`

Expected: 3+ matches showing the variable, function, and call.

**Step 5: Commit**

```
feat(installer): write .install-meta after installation

- Add META_FILE variable pointing to ~/.toony/.install-meta
- Add write_meta() function to record SOURCE, LOCAL_PATH, timestamps
- Call write_meta() at end of main() after install_cli
```

---

### Task 2: Add `cmd_update()` to `toony.sh`

**Files:**
- Modify: `toony.sh:4-8` (add META_FILE, REPO, HEALTH_TIMEOUT variables)
- Modify: `toony.sh:10-13` (add warn helper)
- Modify: `toony.sh:87-90` (add cmd_update after cmd_backup)
- Modify: `toony.sh:92-103` (add update to help text)
- Modify: `toony.sh:110-120` (add update case to dispatch)

**Step 1: Add new variables and `warn` helper**

In `toony.sh`, add variables after line 8 (`BACKUP_DIR`):

```bash
BACKUP_DIR="$INSTALL_DIR/backups/db"
META_FILE="$INSTALL_DIR/.install-meta"
REPO="bikerlfh/toony-dev-core"
HEALTH_TIMEOUT=60
```

Add `warn` helper after the `error` helper on line 13:

```bash
error()   { printf "\033[1;31m✗\033[0m %s\n" "$1" >&2; exit 1; }
warn()    { printf "\033[1;33m⚠\033[0m %s\n" "$1"; }
```

**Step 2: Add the `cmd_update()` function**

Add this function after `cmd_backup()` (after line 86), before `cmd_uninstall()`:

```bash
cmd_update() {
    local use_local="" no_backup=false

    # Parse flags
    while [ $# -gt 0 ]; do
        case "$1" in
            --local)
                use_local="${2:?--local requires a path argument}"
                use_local="$(cd "$use_local" && pwd)"
                [ -f "$use_local/docker-compose.prod.yml" ] || error "--local path must point to the toony-dev-core repo root."
                shift 2
                ;;
            --no-backup)
                no_backup=true
                shift
                ;;
            *)
                error "Unknown flag: $1. Usage: toony update [--local PATH] [--no-backup]"
                ;;
        esac
    done

    # Resolve source from metadata if no --local flag
    if [ -z "$use_local" ] && [ -f "$META_FILE" ]; then
        local meta_source meta_local_path
        meta_source=$(grep -E '^SOURCE=' "$META_FILE" | cut -d= -f2)
        meta_local_path=$(grep -E '^LOCAL_PATH=' "$META_FILE" | cut -d= -f2)

        if [ "$meta_source" = "local" ] && [ -n "$meta_local_path" ]; then
            if [ -d "$meta_local_path" ]; then
                use_local="$meta_local_path"
                info "Using local source from metadata: $use_local"
            else
                warn "Local path from metadata no longer exists: $meta_local_path"
                warn "Falling back to remote (GitHub)."
            fi
        fi
    fi

    # Verify Docker is running
    if ! docker info >/dev/null 2>&1; then
        error "Docker daemon is not running. Start Docker and retry."
    fi

    # Backup database
    if [ "$no_backup" = false ]; then
        info "Backing up database before update..."
        cmd_backup
        printf "\n"
    else
        warn "Skipping database backup (--no-backup)."
    fi

    # Fetch new code to a temp directory
    local tmp_dir
    tmp_dir=$(mktemp -d)
    trap 'rm -rf "$tmp_dir"' RETURN

    if [ -n "$use_local" ]; then
        info "Copying from local directory ($use_local)..."
        rsync -a --exclude='.git' --exclude='node_modules' --exclude='.next' \
            --exclude='__pycache__' --exclude='.env' --exclude='.env.prod' \
            "$use_local/" "$tmp_dir/"
        success "Copied to temp directory."
    else
        info "Downloading latest version from GitHub..."
        local tarball_url="https://github.com/$REPO/archive/refs/heads/main.tar.gz"
        local archive="$tmp_dir/toony.tar.gz"

        if command -v curl >/dev/null 2>&1; then
            curl -fsSL "$tarball_url" -o "$archive"
        elif command -v wget >/dev/null 2>&1; then
            wget -q "$tarball_url" -O "$archive"
        else
            error "Neither curl nor wget found."
        fi

        local extract_dir="$tmp_dir/extracted"
        mkdir -p "$extract_dir"
        tar -xzf "$archive" -C "$extract_dir" --strip-components=1
        # Move extracted content to tmp_dir root for consistent path
        rsync -a "$extract_dir/" "$tmp_dir/" && rm -rf "$extract_dir" "$archive"
        success "Downloaded and extracted."
    fi

    # Stop services
    info "Stopping services..."
    compose stop

    # Replace app directory
    info "Replacing application files..."
    rm -rf "$APP_DIR"
    mkdir -p "$APP_DIR"
    rsync -a "$tmp_dir/" "$APP_DIR/"
    success "Application files updated."

    # Rebuild containers
    info "Rebuilding containers (this may take a few minutes)..."
    compose build --quiet

    # Start services
    info "Starting services..."
    compose up -d

    # Wait for healthy
    info "Waiting for services to be ready..."
    local elapsed=0
    while [ $elapsed -lt $HEALTH_TIMEOUT ]; do
        local db_healthy redis_healthy
        db_healthy=$(compose ps db --format '{{.Health}}' 2>/dev/null || echo "")
        redis_healthy=$(compose ps redis --format '{{.Health}}' 2>/dev/null || echo "")

        if [[ "$db_healthy" == *"healthy"* ]] && [[ "$redis_healthy" == *"healthy"* ]]; then
            success "All services are healthy."
            break
        fi

        sleep 2
        elapsed=$((elapsed + 2))
        printf "."
    done

    if [ $elapsed -ge $HEALTH_TIMEOUT ]; then
        printf "\n"
        error "Services did not become healthy within ${HEALTH_TIMEOUT}s. Check: toony logs"
    fi

    # Run migrations
    info "Running database migrations..."
    if ! compose exec -T backend python manage.py migrate --noinput; then
        printf "\n"
        warn "Migrations failed! Your database may be in an inconsistent state."
        warn "A backup was created before the update. Restore it with:"
        printf "     \033[1mtoony backup --list\033[0m  (to find the backup file)\n"
        printf "     Then reinstall with: \033[1minstall.sh --restore <backup-file>\033[0m\n"
        exit 1
    fi
    success "Migrations applied."

    # Update metadata
    if [ -f "$META_FILE" ]; then
        local new_source="remote"
        local new_local_path=""
        if [ -n "$use_local" ]; then
            new_source="local"
            new_local_path="$use_local"
        fi

        local installed_at
        installed_at=$(grep -E '^INSTALLED_AT=' "$META_FILE" | cut -d= -f2)

        cat > "$META_FILE" <<EOF
SOURCE=$new_source
LOCAL_PATH=$new_local_path
INSTALLED_AT=${installed_at}
UPDATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF
    fi

    # Reinstall CLI scripts
    cp "$APP_DIR/toony.sh" "$INSTALL_DIR/toony.sh"
    cp "$APP_DIR/uninstall.sh" "$INSTALL_DIR/uninstall.sh"
    chmod +x "$INSTALL_DIR/toony.sh" "$INSTALL_DIR/uninstall.sh"
    success "CLI scripts updated."

    # Summary
    local port
    port=$(grep -E '^NGINX_PORT=' "$ENV_FILE" | cut -d= -f2)
    printf "\n"
    printf "\033[1;32m✅ Toony has been updated successfully!\033[0m\n"
    printf "\n"
    printf "  \033[1mURL:\033[0m  http://localhost:%s\n" "$port"
    printf "\n"
}
```

**Step 3: Add `update` to `cmd_help()`**

In the `cmd_help()` function, add the update line after the backup line:

```bash
    printf "  \033[1mbackup\033[0m      Backup the database (--list to show backups)\n"
    printf "  \033[1mupdate\033[0m      Update to the latest version (--local PATH, --no-backup)\n"
    printf "  \033[1muninstall\033[0m   Remove Toony and all data\n"
```

**Step 4: Add `update` case to the dispatch**

In the case statement at the bottom, add the update case:

```bash
case "$command" in
    start)      cmd_start ;;
    stop)       cmd_stop ;;
    restart)    cmd_restart ;;
    logs)       cmd_logs "$@" ;;
    status|ps)  cmd_status ;;
    backup)     cmd_backup "$@" ;;
    update)     cmd_update "$@" ;;
    uninstall)  cmd_uninstall ;;
    help|--help|-h) cmd_help ;;
    *)          error "Unknown command: $command. Run 'toony help' for usage." ;;
esac
```

**Step 5: Verify syntax**

Run: `bash -n toony.sh`

Expected: No output (no syntax errors).

**Step 6: Commit**

```
feat(cli): add toony update command

- Add cmd_update() with --local PATH and --no-backup flags
- Read .install-meta to resolve default source (remote/local)
- Backup DB before updating (skippable with --no-backup)
- Fetch to temp dir, stop services, swap code, rebuild, start, migrate
- Update .install-meta timestamps and source after success
- Reinstall CLI scripts from updated app directory
- Add update to help text and command dispatch
```

---

### Task 3: Update `uninstall.sh` to clean up `.install-meta`

**Files:**
- Modify: `uninstall.sh:85-90` (add rm for .install-meta)

**Step 1: Add cleanup line**

In `uninstall.sh`, after line 90 (`rm -f "$INSTALL_DIR/uninstall.sh"`), add:

```bash
rm -f "$INSTALL_DIR/uninstall.sh"
rm -f "$INSTALL_DIR/.install-meta"
```

**Step 2: Verify**

Run: `grep -n 'install-meta' uninstall.sh`

Expected: 1 match showing the rm line.

**Step 3: Commit**

```
chore(uninstall): clean up .install-meta on uninstall

- Add rm -f for .install-meta in teardown section
```

---

### Task 4: Update `install.sh` summary to mention update command

**Files:**
- Modify: `install.sh:397-409` (add update to manage line in print_summary)

**Step 1: Add update to the summary**

In `print_summary()`, update the manage line to include `update`:

```bash
    printf "  \033[1mManage:\033[0m     toony start | stop | restart | logs | status\n"
    printf "  \033[1mUpdate:\033[0m     toony update\n"
    printf "  \033[1mUninstall:\033[0m  toony uninstall\n"
```

**Step 2: Commit**

```
docs(installer): mention toony update in post-install summary

- Add Update line to print_summary output
```

---

### Task 5: Smoke test (manual)

**Verification steps** (not automated — these are Docker-dependent):

1. **Syntax check both scripts:**
   ```bash
   bash -n install.sh && echo "install.sh OK"
   bash -n toony.sh && echo "toony.sh OK"
   bash -n uninstall.sh && echo "uninstall.sh OK"
   ```

2. **Verify help output:**
   ```bash
   # Simulate (without needing ~/.toony to exist):
   grep -A1 'update' toony.sh | head -5
   ```

3. **Check all .install-meta references are consistent:**
   ```bash
   grep -rn 'install-meta' install.sh toony.sh uninstall.sh
   ```
   Expected: install.sh (META_FILE var + write_meta), toony.sh (META_FILE var + read in cmd_update + write in cmd_update), uninstall.sh (rm -f)
