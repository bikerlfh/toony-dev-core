# Phase 7: Issues, Comments & Activity Log (Backend)

## Context

Phases 1-6 delivered the backend (Django 5 + DRF, JWT auth, Organizations, Memberships, RBAC, Teams, Labels, Projects, Milestones, Cycles) and the frontend foundation. Phase 7 adds the core issue tracking domain: **Issue** (with auto-generated identifiers, sub-issues, label M2M), **IssueComment**, and **IssueActivity** (append-only audit log).

**Design doc:** `docs/2026-03-01-toony-dev-core-design.md`

---

## Plan

### A. Models

1. **`projects/models/issue.py`**:
   - **IssueStatus**: BACKLOG, TODO, IN_PROGRESS, IN_REVIEW, DONE, CANCELED
   - **IssuePriority**: NONE, URGENT, HIGH, MEDIUM, LOW
   - **Issue**: project (FK→Project), milestone (FK→Milestone, nullable), cycle (FK→Cycle, nullable), parent (self-FK for sub-issues), identifier (unique, auto-generated as `{team.identifier}-{seq}`), title, description, status, priority, assignee (FK→User, nullable), reporter (FK→User), labels (M2M→Label), estimate, due_date, sort_order, external_tracker fields

2. **`projects/models/comment.py`**:
   - **IssueComment**: issue (FK→Issue), author (FK→User), body (markdown), edited_at

3. **`projects/models/activity.py`**:
   - **IssueActivity**: Append-only audit log (NOT BaseModel — no updated_at). Fields: id (UUID), issue (FK→Issue), user (FK→User), action, field_changed, old_value, new_value, created_at

4. Migration: `projects/migrations/0003_issue_comment_activity.py`

### B. Selectors

5. **`issue_selector.py`** — `get_next_identifier()`, `list_project_issues()` (with filters), `get_issue_by_identifier()`, `list_issue_comments()`, `list_issue_activities()`

### C. Services

6. **`issue_service.py`** — `create_issue()` (atomic: generates identifier + creates IssueActivity), `update_issue()` (tracks field changes in IssueActivity), `delete_issue()`, `create_comment()` (atomic: creates comment + IssueActivity), `update_comment()`, `delete_comment()`

### D. Serializers

7. **Input**: `CreateIssueSerializer`, `UpdateIssueSerializer`, `CreateCommentSerializer`, `UpdateCommentSerializer`
8. **Output**: `IssueListSerializer`, `IssueDetailSerializer` (with sub_issue_count, nested milestone/cycle/labels), `IssueCommentSerializer`, `IssueActivitySerializer`

### E. Views

9. **`issue_views.py`** — `IssueListCreateView`, `IssueDetailView`, `IssueCommentListCreateView`, `IssueCommentDetailView`, `IssueActivityListView`

### F. URLs, Admin

10. Extended `projects/urls.py` with issue, comment, activity routes (using `{identifier}` in URL, not UUID)
11. Extended `projects/admin.py` with Issue, IssueComment, IssueActivity

---

## API Endpoints

All under `/api/v1/organizations/{org_slug}/projects/{project_slug}/`:

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `issues/` | IsProjectAccessible | List issues (filterable) |
| POST | `issues/` | IsProjectAccessible | Create issue |
| GET | `issues/{identifier}/` | IsProjectAccessible | Get issue detail |
| PUT | `issues/{identifier}/` | IsProjectAccessible | Update issue |
| DELETE | `issues/{identifier}/` | IsProjectAccessible | Delete issue |
| GET | `issues/{identifier}/comments/` | IsProjectAccessible | List comments |
| POST | `issues/{identifier}/comments/` | IsProjectAccessible | Create comment |
| PUT | `issues/{identifier}/comments/{id}/` | IsProjectAccessible | Update comment |
| DELETE | `issues/{identifier}/comments/{id}/` | IsProjectAccessible | Delete comment |
| GET | `issues/{identifier}/activities/` | IsProjectAccessible | List activities (read-only) |

---

## File Manifest

**5 new files, 6 modified files:**

| Section | Files |
|---------|-------|
| A (Models) | `projects/models/issue.py` (new), `projects/models/comment.py` (new), `projects/models/activity.py` (new), `projects/models/__init__.py` (modify), `projects/migrations/0003_*.py` (new) |
| B (Selectors) | `projects/selectors/issue_selector.py` (new), `projects/selectors/__init__.py` (modify) |
| C (Services) | `projects/services/issue_service.py` (new), `projects/services/__init__.py` (modify) |
| D (Serializers) | `projects/serializers/input.py` (modify), `projects/serializers/output.py` (modify) |
| E (Views) | `projects/views/issue_views.py` (new), `projects/views/__init__.py` (modify) |
| F (URLs/Admin) | `projects/urls.py` (modify), `projects/admin.py` (modify) |

---

## Key Decisions

1. **Issue identifier uses team prefix** — `{team.identifier}-{seq}` (e.g., "ENG-42"), globally unique.
2. **Issues use `identifier` in URLs** — not UUID, making URLs human-readable.
3. **IssueActivity is append-only** — no `updated_at`, no BaseModel inheritance, immutable audit trail.
4. **Field change tracking** — `update_issue()` compares old vs new values and bulk-creates IssueActivity records.
5. **Filtering via query params** — `list_project_issues()` supports status, priority, assignee, milestone, cycle, labels, parent filters.
6. **Hard delete for issues/comments** — consistent with Phase 6 approach for project-scoped entities.
