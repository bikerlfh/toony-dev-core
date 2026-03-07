# Issue Full Detail Endpoint

## Goal

Create a new project-independent endpoint `/api/issues/{issue_id}/` that returns complete issue context (detail + comments + activities + artifacts + documents) in a single call. Replace the MCP server's multi-project search loop in `get_issue` with this single endpoint.

## URL & Routing

- `GET /api/issues/<issue_id>/` registered in `backend/config/urls.py`
- `issue_id` accepts both UUID and identifier (e.g., `ENG-42`)
- Read-only (GET only) — mutations stay on project-scoped endpoints

## Backend: Selector

New function in `backend/projects/selectors/issue_selector.py`:

```python
def get_issue_full_detail(issue_id_or_identifier: str) -> Issue:
```

- Valid UUID → lookup by `id`
- Otherwise → lookup by `identifier` (case-insensitive)
- `select_related`: assignee, reporter, milestone, cycle, parent, project
- `prefetch_related`: labels, comments (with author), activities (with user), artifacts (with agent_task), documents (with uploaded_by)
- Raises `Issue.DoesNotExist` if not found

## Backend: Serializer

New `IssueFullDetailSerializer` in `backend/projects/serializers/output.py`:

Top-level fields (same as `IssueDetailSerializer`):
- id, identifier, title, description, status, priority
- assignee, reporter (nested `UserDetailSerializer`)
- labels (nested `LabelSerializer`, many)
- milestone (nested `MilestoneSerializer`), cycle (nested `CycleSerializer`)
- parent_identifier, sub_issue_count
- estimate, due_date, sort_order
- external_tracker_name, external_tracker_url, external_tracker_id
- created_at, updated_at

Additional fields:
- `project` — nested object (id, name, icon, color) via `_IssueProjectSerializer`
- `comments` — list of `IssueCommentSerializer` (ordered by `created_at` asc)
- `activities` — list of `IssueActivitySerializer` (ordered by `-created_at`)
- `artifacts` — list of `IssueArtifactListSerializer` (ordered by `-created_at`)
- `documents` — list of `IssueDocumentSerializer` (ordered by `-created_at`)

All fields read_only. All collections unpaginated.

## Backend: View & Permission

New `IssueFullDetailView(APIView)` in `backend/projects/views/issue_views.py`:

- `permission_classes = [IsAuthenticated]`
- GET only
- Calls `get_issue_full_detail(issue_id_or_identifier)`
- Returns 404 if issue not found
- Checks `ProjectMembership` exists for `(issue.project, request.user)` — returns 403 if not
- Serializes with `IssueFullDetailSerializer`

## MCP Server Changes

**`client.py`** — New method:
```python
def get_issue_detail(self, issue_id: str):
    return self._get(f"/issues/{issue_id}/")
```

**`tools/issues.py`** — Simplify `get_issue` to a single API call:
```python
@mcp.tool()
def get_issue(issue_id: str) -> str:
    client = get_client()
    result = client.get_issue_detail(issue_id)
    return json.dumps(result)
```

## Tests

In `backend/tests/`:
- UUID lookup — create issue with comments, artifacts, documents, activities; GET by UUID; assert 200 with all nested collections
- Identifier lookup — GET by identifier (e.g., `ENG-1`); assert 200
- 404 — invalid UUID and invalid identifier both return 404
- 401 — unauthenticated request
- 403 — authenticated user who is not a project member
- Empty collections — issue with no related data returns empty lists
