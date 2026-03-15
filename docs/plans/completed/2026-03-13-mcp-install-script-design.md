# MCP Install Script — Design

## What it does

A shell script (`install.sh`) that installs the Toony MCP server globally for Claude Code.

## Flow

1. Validate prerequisites: `git`, `uv`, `claude`
2. Clone repo with `git clone --depth 1` to a temp directory
3. Copy `mcp-server/` to `~/.toony/`
4. Prompt for `TOONY_API_URL` (default: http://localhost:8000/api) and `TOONY_API_KEY` (required)
5. Run `claude mcp add toony --scope user --transport stdio -- uv --directory ~/.toony run toony-mcp`
6. Run `claude mcp add-env toony TOONY_API_URL <url>`
7. Run `claude mcp add-env toony TOONY_API_KEY <key>`
8. Clean up temp directory

## Location

`mcp-server/install.sh`
