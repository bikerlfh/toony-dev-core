# Runner MCP Installation Check Design

**Date:** 2026-03-15
**Status:** Approved

## Overview

Automatically verify and install the Toony MCP server when the agent runner starts up.

## Decisions

| Aspect | Decision |
|---|---|
| Check method | Verify `~/.toony/mcp-server/` directory exists |
| Timing | In `cli()`, before calling `run()` |
| Install method | `curl -fsSL .../install.sh \| bash` with env vars |
| API URL derivation | From runner's `backend_url`: `ws://host:port/...` → `http://host:port/api` |
| API key | Same as runner's `config.api_key` |
| If install fails | Block — runner exits with error |

## Changes

### install.sh

Add non-interactive mode: if `TOONY_API_URL` and `TOONY_API_KEY` environment variables are already set, skip the interactive prompts and the overwrite confirmation. If they are not set, fall back to the current interactive behavior (no breaking change for `curl | bash`).

### Runner (main.py → cli())

After loading config and validating `api_key`, before calling `run()`:

1. Check if `~/.toony/mcp-server/` exists.
2. If it does, continue normally.
3. If it does not:
   a. Derive `TOONY_API_URL` from `backend_url` by replacing `ws://`/`wss://` with `http://`/`https://`, stripping the path, and appending `/api`.
   b. Run `curl -fsSL https://raw.githubusercontent.com/bikerlfh/toony-mcp/main/install.sh | bash` as a subprocess, passing `TOONY_API_URL` and `TOONY_API_KEY` as environment variables.
   c. If the subprocess fails, log the error and exit.
