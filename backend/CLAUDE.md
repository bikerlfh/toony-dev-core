# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository's backend.

## Commands

```bash
# All run inside Docker (via Makefile from repo root)
make test                   # pytest -v
make test-cov               # pytest --cov --cov-report=term-missing
make lint                   # flake8 --max-line-length=120 --exclude=migrations,__pycache__
make migrate                # python manage.py migrate
make makemigrations         # python manage.py makemigrations
make shell                  # python manage.py shell
make seed                   # python manage.py seed_data

# Single test
docker compose exec backend pytest tests/test_issues.py::TestIssueAPI::test_create_issue -v

# Single test file
docker compose exec backend pytest tests/test_accounts.py -v
```

Test config is in `pyproject.toml`. Tests use pytest-django + factory_boy. All factories in `tests/factories.py`, fixtures in `conftest.py`. Tests override cache to LocMemCache and channels to InMemoryChannelLayer (no Redis needed).

## Architecture

Layered pattern per app — **never put business logic in views or serializers**:

```
URLs → Permission → View → Selector (reads) / Service (writes) → Serializer → Response
```

### Conventions

**Permissions resolve resources.** Permission classes attach resolved objects to `request`:
```python
# After IsOrganizationMember passes:
request.organization  # Organization instance
request.membership    # OrganizationMembership instance

# After IsProjectAccessible passes:
request.project       # Project instance (also sets org + membership)
```
Views use these directly — no redundant DB lookups.

**Input serializers are plain Serializers** (never ModelSerializer). They validate only; services handle creation/updates.

**Output serializers are ModelSerializer** with `read_only_fields = fields`. Nested serializers for FK relationships.

**Services** are plain functions (not classes). Use `transaction.atomic()`. Call `broadcast()` after writes for WebSocket events.

**Selectors** are pure read-only functions returning querysets. Always use `select_related`/`prefetch_related`.

**Pagination:** All list views use `PaginatedViewMixin` with cursor pagination (50/page, max 100, param `?cursor=`).

**Custom exceptions:** `ConflictError` (409), `ServiceUnavailable` (503) in `common/exceptions.py`.

### Role Hierarchy

```python
ADMIN_ROLES   = {OWNER, ADMIN}
MANAGER_ROLES = ADMIN_ROLES | {MANAGER}
WRITE_ROLES   = MANAGER_ROLES | {MEMBER}
ALL_ROLES     = WRITE_ROLES | {VIEWER}
```

### Settings

`config/settings/base.py` (always loaded), `development.py` (adds BrowsableAPI + SQL logging), `production.py` (HTTPS/HSTS).

AUTH_USER_MODEL = `accounts.User` (email as USERNAME_FIELD). JWT: 30min access, 7d refresh, rotation + blacklist enabled.

Encrypted fields use `django-encrypted-model-fields` with `FIELD_ENCRYPTION_KEY` env var.

## Field Map

### accounts app
- **User** — `id` (UUID), `email` (unique, USERNAME_FIELD), `first_name`, `last_name`, `avatar`, `created_at`, `updated_at`
- **OrganizationMembership** — `id`, `user` → User, `organization` → Organization, `role` (OWNER|ADMIN|MANAGER|MEMBER|VIEWER), `invited_by` → User?, `joined_at`, `is_active`

### organizations app
- **Organization** — `id`, `name`, `slug` (unique), `description`, `website`, `industry`, `logo`, `is_active`
- **OrganizationSettings** — 1:1 → Organization, `default_project_methodology` (SCRUM|KANBAN|CUSTOM), `timezone`, `notification_preferences` (JSON), `allowed_ip_ranges` (JSON), `audit_log_retention_days`
- **RepositoryCredential** — `organization` → Org, `name`, `provider` (GITHUB|GITLAB|BITBUCKET|CUSTOM), `credential_type` (TOKEN|SSH_KEY|APP_CREDENTIAL), `encrypted_value`, `url_pattern`, `is_active`
- **IntegrationConfig** — `organization` → Org, `provider` (LINEAR|JIRA|TRELLO|SLACK|CUSTOM), `encrypted_credentials`, `webhook_url`, `is_active`

### projects app
- **Team** — `id`, `organization` → Org, `name`, `slug`, `description`, `identifier` (max 10), `is_active`
- **TeamMembership** — `team` → Team, `user` → User, `role` (LEAD|MEMBER)
- **Label** — `id`, `organization` → Org, `name`, `color` (hex), `description`
- **Project** — `id`, `organization` → Org, `team` → Team, `name`, `slug`, `description`, `status` (BACKLOG|PLANNED|IN_PROGRESS|PAUSED|COMPLETED|CANCELED), `priority` (NONE|URGENT|HIGH|MEDIUM|LOW), `lead` → User?, `start_date`, `target_date`, `completed_at`, `sort_order`, `icon`, `color`
- **ProjectMembership** — `project` → Project, `user` → User, `role` (LEAD|CONTRIBUTOR|REVIEWER)
- **ProjectSettings** — 1:1 → Project, `repository_url`, `repository_credential` → RepositoryCredential?, `default_branch`, `branch_naming_convention`, `required_reviewers_count`, `auto_close_completed_issues`, `issue_prefix_override`, `estimation_method` (STORY_POINTS|T_SHIRT|HOURS)
- **Milestone** — `project` → Project, `name`, `description`, `target_date`, `status` (PLANNED|IN_PROGRESS|COMPLETED), `sort_order`
- **Cycle** — `project` → Project, `name`, `number`, `start_date`, `end_date`, `status` (PLANNED|ACTIVE|COMPLETED)
- **Issue** — `project` → Project, `milestone`?, `cycle`?, `parent`? (self), `identifier` (e.g. "ENG-42", unique), `title`, `description`, `status` (BACKLOG|TODO|IN_PROGRESS|IN_REVIEW|DONE|CANCELED), `priority`, `assignee` → User?, `reporter` → User, `labels` → M2M Label, `estimate`, `due_date`, `sort_order`, `external_tracker_name`, `external_tracker_url`, `external_tracker_id`
- **IssueComment** — `issue` → Issue, `author` → User, `body`, `edited_at`
- **IssueActivity** — `issue` → Issue, `user` → User, `action`, `field_changed`, `old_value`, `new_value`, `created_at` (no updated_at)

### agents app
- **SubAgent** — `organization` → Org, `name`, `slug`, `description`, `version`, `status` (DRAFT|ACTIVE|INACTIVE|DEPRECATED), `agent_type` (CODER|REVIEWER|TESTER|PLANNER|CUSTOM), `capabilities` (JSON), `encrypted_configuration`, `max_concurrent_tasks`, `tags` (JSON), `created_by` → User, `assigned_projects` → M2M Project
- **Skill** — `organization` → Org, `name`, `slug`, `description`, `version`, `content`, `status`, `category` (CODING|TESTING|REVIEW|DOCUMENTATION|DEPLOYMENT|CUSTOM), `input_schema` (JSON), `output_schema` (JSON), `compatible_agent_types` (JSON), `tags` (JSON), `created_by` → User
- **SubAgentSkill** — `sub_agent` → SubAgent, `skill` → Skill, `priority`, `is_enabled`, `custom_config` (JSON)
- **SkillVersion** — `skill` → Skill, `version`, `content`, `changelog`, `created_by` → User

### importers app
- **ImportJob** — `organization` → Org, `target_project` → Project?, `provider` (LINEAR|JIRA|TRELLO|ASANA|GITHUB_PROJECTS), `status` (PENDING|IN_PROGRESS|COMPLETED|FAILED|PARTIALLY_COMPLETED), `config` (JSON), `progress`, `total_items`, `imported_items`, `error_log` (JSON), `started_by` → User, `started_at`, `completed_at`
- **ImportMapping** — `import_job` → ImportJob, `external_id`, `external_type`, `internal_id` (UUID), `internal_type`

## API Routes

All endpoints use UUIDs. No `/v1/` prefix.

```
api/auth/{register,login,refresh,me}/

api/organizations/                                 (GET, POST)
api/organizations/<org_id>/                        (GET, PATCH, DELETE)
  /members/, /members/<user_id>/
  /settings/
  /credentials/, /credentials/<credential_id>/
  /integrations/, /integrations/<integration_id>/
  /imports/, /imports/<job_id>/
    /mappings/
  /imports/external-projects/

api/search/<org_id>/                               (GET, ?q=)

api/workspace/
  /labels/, /labels/<label_id>/
  /teams/, /teams/<team_id>/
    /members/, /members/<user_id>/

api/projects/                                      (GET, POST)
api/projects/<project_id>/                         (GET, PUT, DELETE)
  /members/, /members/<user_id>/
  /settings/
  /teams/, /teams/<team_id>/
  /resources/, /resources/<resource_id>/
  /milestones/, /milestones/<milestone_id>/
  /cycles/, /cycles/<cycle_id>/
  /issues/, /issues/<issue_id>/
    /comments/, /comments/<comment_id>/
    /activities/

api/subagents/, /subagents/<sub_agent_id>/
  /skills/, /skills/<sub_agent_skill_id>/
api/skills/, /skills/<skill_id>/
  /versions/

api/toony-agents/, /toony-agents/<agent_id>/
  /keys/, /keys/<key_id>/
  /tasks/, /tasks/<task_id>/
    /cancel/
    /events/

ws/projects/<project_id>/        (JWT via ?token=)
ws/subagents/<sub_agent_id>/     (JWT via ?token=)
ws/toony-agents/<agent_id>/      (JWT via ?token=)
```
