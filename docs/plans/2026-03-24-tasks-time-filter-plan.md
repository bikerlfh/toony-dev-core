# Tasks Page Time Filter — Implementation Plan

Design: `docs/plans/2026-03-24-tasks-time-filter-design.md`

## Steps

### 1. Backend: selector support
**File:** `backend/apps/projects/selectors/issue_selector.py`
- In `list_user_issues`, add handling for `updated_after` key in the `filters` dict
- Apply `qs.filter(updated_at__gte=filters["updated_after"])` when present

### 2. Backend: view param extraction
**File:** `backend/apps/projects/views/issue_views.py`
- In `UserIssueListView.get`, add `"updated_after"` to the `for key in (...)` loop that extracts query params

### 3. Frontend: API function
**File:** `frontend/lib/api/issues.ts`
- In `listAllIssues`, add `updated_after?: string` to the filters type
- Append `updated_after` to URLSearchParams when present

### 4. Frontend: Tasks page filter UI
**File:** `frontend/app/(dashboard)/tasks/page.tsx`
- Add `updated_after?: string` to `Filters` interface
- Add time range `<Select>` with options: Últimas 24h (1), Últimos 3 días (3), Última semana (7), Últimas 2 semanas (14), Último mes (30), Últimos 3 meses (90), Todos ("")
- On change, compute ISO date string and update filters state
- Place the select between the Priority filter and the "Create issue" button

### 5. Test
- Verify backend accepts `updated_after` param and filters correctly
- Verify frontend dropdown updates the board when selecting different ranges
