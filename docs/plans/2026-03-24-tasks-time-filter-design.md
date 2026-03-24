# Tasks Page Time Filter — Design

## Summary

Add a time-range filter to the Tasks page that filters issues by `updated_at`. The frontend calculates the cutoff date and sends `updated_after` as an ISO datetime query parameter to the backend.

## Filter Options

| Label            | Calculation       | Query param value          |
|------------------|-------------------|----------------------------|
| Últimas 24h      | `now - 1 day`     | ISO datetime               |
| Últimos 3 días   | `now - 3 days`    | ISO datetime               |
| Última semana    | `now - 7 days`    | ISO datetime               |
| Últimas 2 semanas| `now - 14 days`   | ISO datetime               |
| Último mes       | `now - 30 days`   | ISO datetime               |
| Últimos 3 meses  | `now - 90 days`   | ISO datetime               |
| Todos (default)  | —                 | not sent                   |

## Changes

### Backend

1. **`projects/selectors/issue_selector.py`** — `list_user_issues`: if `updated_after` in filters, apply `qs.filter(updated_at__gte=filters["updated_after"])`.
2. **`projects/views/issue_views.py`** — `UserIssueListView.get`: add `"updated_after"` to the extracted query params.

### Frontend

1. **`lib/api/issues.ts`** — `listAllIssues`: accept and forward `updated_after` query param.
2. **`app/(dashboard)/tasks/page.tsx`**:
   - Add `updated_after?: string` to `Filters` interface.
   - Add a `<Select>` with the 7 options between Priority filter and "Create issue" button.
   - On selection, compute `new Date(Date.now() - days * 86400000).toISOString()` and set in filters. Empty value = "Todos" (no param sent).

## UI Placement

The new select appears after the Priority filter, before the "Create issue" button, using the same `<Select>` component and styling.
