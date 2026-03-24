# Design: `toony runner config` & `toony runner start`

## Summary

Add two sub-commands to `toony.sh` under `toony runner` to configure and run `toony_agent_runner` instances from the CLI.

## File Structure

```
~/.toony/
├── app/                          # Replaced on every update
│   └── toony_agent_runner/       # Runner source code
├── runners/                      # Survives updates
│   ├── venv/                     # Virtualenv (websockets + pyyaml)
│   ├── mi-runner.yml             # Named config
│   └── produccion.yml            # Another config
├── toony.sh
├── .env.prod
└── .install-meta
```

## Commands

### `toony runner config`

Interactive wizard that creates a new runner config file.

**Flow:**
1. Prompt for runner name (e.g., `mi-runner`)
2. If `~/.toony/runners/<name>.yml` already exists → error + suggest editing manually
3. Prompt for `api_key` (input without echo)
4. Prompt for `workspace_root` (default: `~/work`, Enter to accept)
5. Auto-resolve `backend_url`: read `NGINX_PORT` from `.env.prod` → `ws://localhost:$PORT/ws/toony-agents/runner/`
6. Generate YAML with entered values + sensible defaults for remaining fields (from `config.example.yml`)
7. Save to `~/.toony/runners/<name>.yml`
8. Print success message with file path

### `toony runner start [name]`

Start a runner daemon using a previously configured config.

**Flow:**
1. If argument provided → use that config directly
2. If no argument:
   - List configs in `~/.toony/runners/*.yml`
   - If 0 → error: "No runners configured. Run: toony runner config"
   - If 1 → use it directly
   - If N → list numbered, prompt for selection
3. Verify config file exists
4. **Virtualenv bootstrap**: if `~/.toony/runners/venv/` doesn't exist, create it and install dependencies (`pip install websockets pyyaml`)
5. Execute: `~/.toony/runners/venv/bin/python -m toony_agent_runner --config <config-path>` with `PYTHONPATH=~/.toony/app`

### `toony runner` (no sub-command)

Show runner-specific help listing available sub-commands.

## Help

`toony help` adds a `runner` line:

```
runner      Manage agent runners (config, start)
```

## Decisions

- **Config storage**: `~/.toony/runners/` — outside `app/`, survives `toony update`
- **Naming**: always interactive, no default name
- **Interactive fields**: name, api_key, workspace_root (default ~/work). backend_url auto-resolved.
- **Existing name**: error + suggest manual edit
- **Runner selection on start**: argument if provided, else list+prompt (or auto-select if only one)
- **Execution**: `python -m toony_agent_runner` with PYTHONPATH pointing to `~/.toony/app`
- **Dependencies**: auto-managed virtualenv at `~/.toony/runners/venv/`
