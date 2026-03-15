# Fix MCP Tools — Design

## Problem

Several MCP tools are broken or misaligned with the backend API after recent backend changes.

## Issues Found

1. **`update_issue` — 405 error**: MCP sends PATCH, backend only accepts PUT
2. **`create_artifact` — 400 error**: MCP missing required `agent_task_id` and `session_id` fields
3. **Search param mismatch**: `list_projects`, `list_project_issues`, `list_labels`, `get_my_issues` send `?search=` but backend expects `?q=`
4. **SubAgent/Skill tools**: backend doesn't support text search; tools unreliable
5. **`get_my_issues` inefficiency**: makes N+2 API calls when `/api/issues/` can do it in 1

## Changes

### MCP Server

1. **Delete `tools/agents.py`** — remove all 8 subagent/skill tools
2. **Fix search param** in `client.py` — `search` → `q` for `list_projects`, `list_project_issues`, `list_labels`
3. **Fix `update_issue`** in `client.py` — `_patch` → `_put`
4. **Optimize `get_my_issues`** — use `GET /api/issues/` endpoint instead of N+2 calls
5. **Clean up `client.py`** — remove subagent/skill methods

### Backend

6. **Make `agent_task_id` and `session_id` optional** in `CreateArtifactSerializer`
