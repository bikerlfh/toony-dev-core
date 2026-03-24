# Runner CLI Commands Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `toony runner config` and `toony runner start` sub-commands to `toony.sh` for configuring and running `toony_agent_runner` instances.

**Architecture:** All changes go in `toony.sh`. New constants for runner paths, a `cmd_runner()` dispatcher function with `runner_config` and `runner_start` helpers. Config YAML generated via heredoc. Virtualenv bootstrapped on first `runner start`.

**Tech Stack:** Bash, YAML (heredoc generation), Python venv

---

### Task 1: Add runner constants and directory

**Files:**
- Modify: `toony.sh:4-11` (constants block)

**Step 1: Add runner constants after existing constants**

Add these lines after `HEALTH_TIMEOUT=60` (line 11):

```bash
RUNNERS_DIR="$INSTALL_DIR/runners"
RUNNERS_VENV="$RUNNERS_DIR/venv"
RUNNER_MODULE_DIR="$APP_DIR/toony_agent_runner"
```

**Step 2: Verify the file still parses**

Run: `bash -n toony.sh`
Expected: no output (success)

**Step 3: Commit**

```bash
git add toony.sh
git commit -m "feat(cli): add runner directory constants to toony.sh

- Add RUNNERS_DIR, RUNNERS_VENV, RUNNER_MODULE_DIR constants"
```

---

### Task 2: Implement `runner_config` wizard

**Files:**
- Modify: `toony.sh` (add function before `cmd_help`)

**Step 1: Add the `runner_config` function**

Insert before `cmd_help()` (before line 271):

```bash
runner_config() {
    # Prompt for runner name
    printf "Runner name: "
    read -r runner_name
    if [ -z "$runner_name" ]; then
        error "Runner name cannot be empty."
    fi

    # Sanitize: only allow alphanumeric, hyphens, underscores
    if ! echo "$runner_name" | grep -qE '^[a-zA-Z0-9_-]+$'; then
        error "Runner name can only contain letters, numbers, hyphens, and underscores."
    fi

    mkdir -p "$RUNNERS_DIR"
    local config_file="$RUNNERS_DIR/${runner_name}.yml"

    if [ -f "$config_file" ]; then
        error "Runner '$runner_name' already exists at $config_file. Edit it manually to reconfigure."
    fi

    # Prompt for API key (no echo)
    printf "API key: "
    read -rs api_key
    printf "\n"
    if [ -z "$api_key" ]; then
        error "API key cannot be empty."
    fi

    # Prompt for workspace_root
    printf "Workspace root [~/work]: "
    read -r workspace_root
    if [ -z "$workspace_root" ]; then
        workspace_root="~/work"
    fi

    # Auto-resolve backend_url from .env.prod
    local port
    port=$(grep -E '^NGINX_PORT=' "$ENV_FILE" | cut -d= -f2)
    if [ -z "$port" ]; then
        port="18789"
        warn "NGINX_PORT not found in .env.prod, using default: $port"
    fi
    local backend_url="ws://localhost:${port}/ws/toony-agents/runner/"

    # Generate config YAML
    cat > "$config_file" <<EOF
backend_url: "${backend_url}"
api_key: "${api_key}"

workspace_root: "${workspace_root}"

clone_protocol: "ssh"

claude:
  working_directory: "."
  max_task_timeout: 3600
  approval_timeout: 600
  max_concurrent_tasks: 1
  permission_mode: "acceptEdits"

reconnect:
  max_retries: -1
  backoff_base: 1
  backoff_max: 30
EOF

    printf "\n"
    success "Runner '$runner_name' configured at $config_file"
    info "To start it: toony runner start $runner_name"
    info "To customize: edit $config_file"
}
```

**Step 2: Verify the file still parses**

Run: `bash -n toony.sh`
Expected: no output (success)

**Step 3: Commit**

```bash
git add toony.sh
git commit -m "feat(cli): add runner_config wizard function

- Interactive prompts for name, api_key, workspace_root
- Auto-resolves backend_url from NGINX_PORT in .env.prod
- Generates YAML config at ~/.toony/runners/<name>.yml
- Validates name uniqueness and format"
```

---

### Task 3: Implement virtualenv bootstrap helper

**Files:**
- Modify: `toony.sh` (add function after `runner_config`)

**Step 1: Add the `ensure_runner_venv` function**

Insert right after `runner_config()`:

```bash
ensure_runner_venv() {
    if [ -d "$RUNNERS_VENV" ] && [ -x "$RUNNERS_VENV/bin/python" ]; then
        return
    fi

    if ! command -v python3 >/dev/null 2>&1; then
        error "python3 is required but not found. Install Python 3.11+ and retry."
    fi

    info "Creating runner virtual environment..."
    python3 -m venv "$RUNNERS_VENV"
    info "Installing runner dependencies..."
    "$RUNNERS_VENV/bin/pip" install --quiet websockets pyyaml
    success "Runner environment ready."
}
```

**Step 2: Verify the file still parses**

Run: `bash -n toony.sh`
Expected: no output (success)

**Step 3: Commit**

```bash
git add toony.sh
git commit -m "feat(cli): add ensure_runner_venv helper

- Creates virtualenv at ~/.toony/runners/venv/ on first use
- Installs websockets and pyyaml dependencies
- Guards on python3 availability"
```

---

### Task 4: Implement `runner_start`

**Files:**
- Modify: `toony.sh` (add function after `ensure_runner_venv`)

**Step 1: Add the `runner_start` function**

Insert right after `ensure_runner_venv()`:

```bash
runner_start() {
    local runner_name="${1:-}"
    local config_file=""

    if [ -n "$runner_name" ]; then
        # Direct name provided
        config_file="$RUNNERS_DIR/${runner_name}.yml"
        if [ ! -f "$config_file" ]; then
            error "Runner config not found: $config_file"
        fi
    else
        # List available configs
        if [ ! -d "$RUNNERS_DIR" ] || ! ls "$RUNNERS_DIR"/*.yml >/dev/null 2>&1; then
            error "No runners configured. Run: toony runner config"
        fi

        local configs=()
        for f in "$RUNNERS_DIR"/*.yml; do
            configs+=("$f")
        done

        if [ ${#configs[@]} -eq 1 ]; then
            config_file="${configs[0]}"
            local name
            name=$(basename "$config_file" .yml)
            info "Using runner: $name"
        else
            printf "\033[1mAvailable runners:\033[0m\n\n"
            local i=1
            for f in "${configs[@]}"; do
                local name
                name=$(basename "$f" .yml)
                printf "  %d) %s\n" "$i" "$name"
                i=$((i + 1))
            done
            printf "\nSelect runner [1-%d]: " "${#configs[@]}"
            read -r selection

            if ! echo "$selection" | grep -qE '^[0-9]+$'; then
                error "Invalid selection."
            fi
            if [ "$selection" -lt 1 ] || [ "$selection" -gt "${#configs[@]}" ]; then
                error "Selection out of range."
            fi
            config_file="${configs[$((selection - 1))]}"
        fi
    fi

    # Verify runner module exists
    if [ ! -d "$RUNNER_MODULE_DIR" ]; then
        error "Runner module not found at $RUNNER_MODULE_DIR. Reinstall or update Toony."
    fi

    # Bootstrap virtualenv
    ensure_runner_venv

    local name
    name=$(basename "$config_file" .yml)
    info "Starting runner '$name'..."
    PYTHONPATH="$APP_DIR" exec "$RUNNERS_VENV/bin/python" -m toony_agent_runner --config "$config_file"
}
```

**Step 2: Verify the file still parses**

Run: `bash -n toony.sh`
Expected: no output (success)

**Step 3: Commit**

```bash
git add toony.sh
git commit -m "feat(cli): add runner_start function

- Accepts optional runner name argument
- Lists and prompts for selection when multiple configs exist
- Auto-selects when only one config exists
- Bootstraps virtualenv on first run
- Executes runner with PYTHONPATH pointing to app dir"
```

---

### Task 5: Implement `cmd_runner` dispatcher and wire into main

**Files:**
- Modify: `toony.sh` (add dispatcher, update case statement and help)

**Step 1: Add `cmd_runner` dispatcher**

Insert right after `runner_start()`:

```bash
cmd_runner() {
    local subcmd="${1:-help}"
    shift 2>/dev/null || true

    case "$subcmd" in
        config)  runner_config ;;
        start)   runner_start "$@" ;;
        help|--help|-h)
            printf "Usage: toony runner <command>\n\n"
            printf "Commands:\n"
            printf "  \033[1mconfig\033[0m    Configure a new agent runner\n"
            printf "  \033[1mstart\033[0m     Start an agent runner\n"
            printf "  \033[1mhelp\033[0m      Show this help\n"
            ;;
        *)  error "Unknown runner command: $subcmd. Run 'toony runner help' for usage." ;;
    esac
}
```

**Step 2: Add `runner` to the main case statement**

In the main `case` block (around line 290), add `runner` before `uninstall`:

```bash
    runner)     cmd_runner "$@" ;;
```

The full case block should be:
```bash
case "$command" in
    start)      cmd_start ;;
    stop)       cmd_stop ;;
    restart)    cmd_restart ;;
    logs)       cmd_logs "$@" ;;
    status|ps)  cmd_status ;;
    backup)     cmd_backup "$@" ;;
    update)     cmd_update "$@" ;;
    runner)     cmd_runner "$@" ;;
    uninstall)  cmd_uninstall ;;
    help|--help|-h) cmd_help ;;
    *)          error "Unknown command: $command. Run 'toony help' for usage." ;;
esac
```

**Step 3: Update `cmd_help` to include runner**

Add this line in `cmd_help()` after the `update` line:

```bash
    printf "  \033[1mrunner\033[0m      Manage agent runners (config, start)\n"
```

**Step 4: Verify the file still parses**

Run: `bash -n toony.sh`
Expected: no output (success)

**Step 5: Commit**

```bash
git add toony.sh
git commit -m "feat(cli): wire runner sub-commands into toony.sh

- Add cmd_runner dispatcher with config/start/help sub-commands
- Add runner to main case statement
- Add runner to toony help output"
```

---

### Task 6: Manual verification

**Step 1: Verify syntax**

Run: `bash -n toony.sh`
Expected: no output (success)

**Step 2: Verify help output**

Run: `bash toony.sh help`
Expected: runner appears in the command list

**Step 3: Verify runner help**

Run: `bash toony.sh runner help`
Expected: shows config/start sub-commands

**Step 4: Final commit (squash if desired)**

All changes are in `toony.sh`. Review the full diff:

```bash
git diff toony.sh
```
