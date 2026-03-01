# Toony Dev Core — System Design

## 1. Overview

Toony Dev Core is a project management application for software development companies. It covers the full lifecycle from design through implementation, with a Linear.app-inspired project management interface. The platform supports multi-tenant organizations, role-based access control, and a plugin-based integration system. A future phase will incorporate AI agent bots (communicating via WebSockets) to assist with implementation tasks.

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12+ / Django 5.x |
| API | Django REST Framework |
| WebSockets | Django Channels (ASGI) + Redis channel layer |
| Frontend | Next.js 15 (App Router) |
| Database | PostgreSQL 16 |
| Cache / Pub-Sub | Redis |
| Auth | JWT (djangorestframework-simplejwt) |
| Secrets | Encrypted DB fields (django-encrypted-model-fields) |

## 3. Repository Structure

```
toony-dev-core/
├── backend/                    # Django project
│   ├── config/                 # Django settings, urls, asgi/wsgi
│   ├── accounts/               # User management & auth
│   ├── organizations/          # Organization management
│   ├── projects/               # Project management (Linear-style)
│   ├── agents/                 # Agent & Skill registry
│   └── importers/              # Plugin-based import system
├── frontend/                   # Next.js application
├── docker/                     # Docker & docker-compose configs
└── docs/                       # Design docs
```

## 4. Architecture Decisions

- **Multi-tenant:** Single deployment serves multiple organizations. Data isolation enforced at the query level (all querysets filtered by organization).
- **UUID primary keys:** All models use `UUIDField(primary_key=True, default=uuid.uuid4)` for security and distributed-system friendliness.
- **RBAC:** Role-Based Access Control with five roles scoped per organization.
- **Multi-org users:** A single user account can belong to multiple organizations with different roles in each.
- **Plugin-based imports:** Each external tool integration (Linear, Jira, etc.) implements a standard interface, making it easy to add new integrations.
- **Encrypted secrets:** Repository credentials and environment variables are stored encrypted at rest in PostgreSQL using django-encrypted-model-fields.
- **MVC with Services pattern:** Backend follows an MVC architecture where Services act as the Controller layer and Selectors implement the Repository pattern for read operations.

## 5. Backend Architecture (MVC + Services + Selectors)

The backend follows a layered MVC architecture with clear separation of concerns. Services act as the Controller layer (business logic), and Selectors implement the Repository pattern for all read/query operations.

### 5.1 Request Flow

```
  HTTP Request
       │
       ▼
  ┌─────────┐    Handles HTTP concerns: auth, serialization,
  │  Views   │    validation, response codes. Delegates to services.
  │ (views/) │    Never contains business logic.
  └────┬─────┘
       │  plain Python data (dicts, dataclasses)
       ▼
  ┌──────────┐   Business logic layer (the "Controller").
  │ Services │   Orchestrates operations, enforces rules,
  │(services/)│  calls selectors for reads, writes to models.
  └──┬────┬──┘
     │    │
     │    ▼ (reads)
     │  ┌───────────┐   Repository pattern. All queries live here.
     │  │ Selectors  │   Returns QuerySets or model instances.
     │  │(selectors/)│   No business logic, only data access.
     │  └─────┬─────┘
     │        │
     ▼        ▼
  ┌──────────────┐
  │    Models     │   Django ORM models. Data definition only.
  │  (models/)   │   No business logic, no queries beyond managers.
  └──────────────┘
```

### 5.2 Layer Rules

| Layer | Can Call | Cannot Call | Responsibility |
|---|---|---|---|
| **Views** | Services, Serializers | Selectors, Models directly | HTTP: parse request, validate input, serialize output, return response |
| **Services** | Selectors, Models (for writes), other Services | Views, Serializers | Business logic, orchestration, write operations (create/update/delete) |
| **Selectors** | Models (QuerySets) | Services, Views | Read-only data access, filtering, aggregation, search |
| **Models** | Nothing | Everything | Data definition, field-level validation, custom managers |

### 5.3 File Structure Per Django App

Each Django app follows this consistent internal structure:

```
backend/
├── config/
│   ├── settings/
│   │   ├── base.py
│   │   ├── development.py
│   │   └── production.py
│   ├── urls.py
│   ├── asgi.py
│   └── wsgi.py
│
├── accounts/
│   ├── models/
│   │   ├── __init__.py
│   │   ├── user.py
│   │   └── membership.py
│   ├── services/
│   │   ├── __init__.py
│   │   ├── user_service.py         # create_user, update_user, deactivate_user
│   │   └── membership_service.py   # invite_member, change_role, remove_member
│   ├── selectors/
│   │   ├── __init__.py
│   │   ├── user_selector.py        # get_user_by_id, list_users_by_org, search_users
│   │   └── membership_selector.py  # get_membership, list_org_members, get_user_role
│   ├── serializers/
│   │   ├── __init__.py
│   │   ├── input.py                # CreateUserSerializer, UpdateUserSerializer
│   │   └── output.py               # UserDetailSerializer, UserListSerializer
│   ├── views/
│   │   ├── __init__.py
│   │   ├── auth_views.py
│   │   └── user_views.py
│   ├── permissions.py
│   ├── urls.py
│   └── admin.py
│
├── organizations/
│   ├── models/
│   │   ├── __init__.py
│   │   ├── organization.py
│   │   ├── settings.py
│   │   ├── credential.py
│   │   └── integration.py
│   ├── services/
│   │   ├── __init__.py
│   │   ├── organization_service.py
│   │   ├── credential_service.py
│   │   └── integration_service.py
│   ├── selectors/
│   │   ├── __init__.py
│   │   ├── organization_selector.py
│   │   ├── credential_selector.py
│   │   └── integration_selector.py
│   ├── serializers/
│   │   ├── __init__.py
│   │   ├── input.py
│   │   └── output.py
│   ├── views/
│   │   ├── __init__.py
│   │   └── organization_views.py
│   ├── permissions.py
│   ├── urls.py
│   └── admin.py
│
├── projects/
│   ├── models/
│   │   ├── __init__.py
│   │   ├── team.py
│   │   ├── project.py
│   │   ├── milestone.py
│   │   ├── cycle.py
│   │   ├── issue.py
│   │   ├── comment.py
│   │   ├── activity.py
│   │   └── label.py
│   ├── services/
│   │   ├── __init__.py
│   │   ├── team_service.py
│   │   ├── project_service.py
│   │   ├── milestone_service.py
│   │   ├── cycle_service.py
│   │   ├── issue_service.py
│   │   └── label_service.py
│   ├── selectors/
│   │   ├── __init__.py
│   │   ├── team_selector.py
│   │   ├── project_selector.py
│   │   ├── milestone_selector.py
│   │   ├── cycle_selector.py
│   │   ├── issue_selector.py
│   │   └── label_selector.py
│   ├── serializers/
│   │   ├── __init__.py
│   │   ├── input.py
│   │   └── output.py
│   ├── views/
│   │   ├── __init__.py
│   │   ├── team_views.py
│   │   ├── project_views.py
│   │   ├── milestone_views.py
│   │   ├── cycle_views.py
│   │   ├── issue_views.py
│   │   └── label_views.py
│   ├── permissions.py
│   ├── urls.py
│   └── admin.py
│
├── agents/
│   ├── models/
│   │   ├── __init__.py
│   │   ├── agent.py
│   │   ├── skill.py
│   │   └── skill_version.py
│   ├── services/
│   │   ├── __init__.py
│   │   ├── agent_service.py
│   │   └── skill_service.py
│   ├── selectors/
│   │   ├── __init__.py
│   │   ├── agent_selector.py
│   │   └── skill_selector.py
│   ├── serializers/
│   │   ├── __init__.py
│   │   ├── input.py
│   │   └── output.py
│   ├── views/
│   │   ├── __init__.py
│   │   ├── agent_views.py
│   │   └── skill_views.py
│   ├── permissions.py
│   ├── urls.py
│   └── admin.py
│
└── importers/
    ├── models/
    │   ├── __init__.py
    │   ├── import_job.py
    │   └── import_mapping.py
    ├── services/
    │   ├── __init__.py
    │   └── import_service.py
    ├── selectors/
    │   ├── __init__.py
    │   └── import_selector.py
    ├── plugins/
    │   ├── __init__.py          # ImportPlugin ABC
    │   ├── linear_plugin.py
    │   ├── jira_plugin.py
    │   └── ...
    ├── serializers/
    │   ├── __init__.py
    │   ├── input.py
    │   └── output.py
    ├── views/
    │   ├── __init__.py
    │   └── import_views.py
    ├── urls.py
    └── admin.py
```

### 5.4 Example Flow: Create an Issue

Demonstrates how a request flows through all layers:

```
1. POST /api/v1/organizations/acme/projects/web-app/issues/

2. IssueCreateView (views/issue_views.py):
   - Validates input with CreateIssueInputSerializer
   - Calls issue_service.create_issue(data)
   - Serializes result with IssueDetailOutputSerializer
   - Returns HTTP 201

3. issue_service.create_issue(data) (services/issue_service.py):
   - Calls project_selector.get_project_by_slug(org, slug)  → validates project exists
   - Calls issue_selector.get_next_identifier(project)       → gets "ENG-124"
   - Creates Issue.objects.create(**data)                     → write to DB
   - Creates IssueActivity record                             → audit log
   - Returns issue instance

4. issue_selector.get_next_identifier(project) (selectors/issue_selector.py):
   - Issue.objects.filter(project=project).count() + 1
   - Returns f"{project.team.identifier}-{next_num}"
```

### 5.5 Example Flow: List Issues with Filters

Demonstrates the selector pattern for read operations:

```
1. GET /api/v1/organizations/acme/projects/web-app/issues/?status=in_progress&assignee=me

2. IssueListView (views/issue_views.py):
   - Extracts filter params from request
   - Calls issue_selector.list_project_issues(project, filters)
   - Serializes result with IssueListOutputSerializer
   - Returns HTTP 200 with paginated results

3. issue_selector.list_project_issues(project, filters) (selectors/issue_selector.py):
   - Builds queryset: Issue.objects.filter(project=project)
   - Applies filters: .filter(status=filters.status, assignee=filters.assignee)
   - Applies ordering and select_related/prefetch_related for performance
   - Returns QuerySet (lazy, not yet evaluated)
```

## 6. Data Models

### 6.1 Accounts App (`accounts`)

#### User

Extends Django's `AbstractUser`.

| Field | Type | Notes |
|---|---|---|
| id | UUIDField | Primary key |
| email | EmailField | Unique, used for login |
| first_name | CharField | |
| last_name | CharField | |
| avatar | ImageField | Nullable |
| is_active | BooleanField | Default True |
| created_at | DateTimeField | Auto |
| updated_at | DateTimeField | Auto |

#### OrganizationMembership

Join table between User and Organization.

| Field | Type | Notes |
|---|---|---|
| id | UUIDField | Primary key |
| user | ForeignKey(User) | |
| organization | ForeignKey(Organization) | |
| role | CharField | Enum: OWNER, ADMIN, MANAGER, MEMBER, VIEWER |
| invited_by | ForeignKey(User) | Nullable |
| joined_at | DateTimeField | Auto |
| is_active | BooleanField | Default True |

**Unique constraint:** `(user, organization)`

#### RBAC Role Definitions

| Role | Permissions |
|---|---|
| OWNER | Full control: delete org, manage billing, all admin permissions |
| ADMIN | Manage members, org settings, all projects |
| MANAGER | Manage assigned projects, create projects |
| MEMBER | Work on assigned issues, create issues |
| VIEWER | Read-only access |

### 6.2 Organizations App (`organizations`)

#### Organization

| Field | Type | Notes |
|---|---|---|
| id | UUIDField | Primary key |
| name | CharField | |
| slug | SlugField | Unique, URL-friendly |
| description | TextField | Nullable |
| logo | ImageField | Nullable |
| website | URLField | Nullable |
| industry | CharField | Nullable |
| is_active | BooleanField | Default True |
| created_at | DateTimeField | Auto |
| updated_at | DateTimeField | Auto |

#### OrganizationSettings

One-to-one with Organization.

| Field | Type | Notes |
|---|---|---|
| id | UUIDField | Primary key |
| organization | OneToOneField(Organization) | |
| default_project_methodology | CharField | Enum: SCRUM, KANBAN, CUSTOM |
| timezone | CharField | Default "UTC" |
| notification_preferences | JSONField | Structured notification config |
| allowed_ip_ranges | JSONField | Nullable, for IP whitelisting |
| audit_log_retention_days | IntegerField | Default 90 |
| updated_at | DateTimeField | Auto |

#### RepositoryCredential

| Field | Type | Notes |
|---|---|---|
| id | UUIDField | Primary key |
| organization | ForeignKey(Organization) | |
| name | CharField | Label, e.g. "GitHub Main" |
| provider | CharField | Enum: GITHUB, GITLAB, BITBUCKET, CUSTOM |
| credential_type | CharField | Enum: TOKEN, SSH_KEY, APP_CREDENTIAL |
| encrypted_value | EncryptedTextField | Encrypted at rest |
| url_pattern | CharField | e.g. "github.com/org-name/*" |
| is_active | BooleanField | Default True |
| created_at | DateTimeField | Auto |
| updated_at | DateTimeField | Auto |

#### IntegrationConfig

| Field | Type | Notes |
|---|---|---|
| id | UUIDField | Primary key |
| organization | ForeignKey(Organization) | |
| provider | CharField | Enum: LINEAR, JIRA, TRELLO, SLACK, CUSTOM |
| encrypted_credentials | EncryptedJSONField | Encrypted at rest |
| webhook_url | URLField | Nullable |
| is_active | BooleanField | Default True |
| created_at | DateTimeField | Auto |
| updated_at | DateTimeField | Auto |

#### Additional Organization-Level Configurations

- **Notification channels:** Slack/Discord webhook URLs for org-wide alerts
- **Default coding standards:** Linting configs and code review rules
- **CI/CD templates:** Default pipeline configs shared across projects
- **API rate limits:** Per-org API usage quotas

### 6.3 Projects App (`projects`)

#### Team

| Field | Type | Notes |
|---|---|---|
| id | UUIDField | Primary key |
| organization | ForeignKey(Organization) | |
| name | CharField | |
| slug | SlugField | Unique within org |
| description | TextField | Nullable |
| identifier | CharField | Short key, e.g. "ENG" (used in issue IDs) |
| is_active | BooleanField | Default True |
| created_at | DateTimeField | Auto |
| updated_at | DateTimeField | Auto |

**Unique constraint:** `(organization, identifier)`

#### TeamMembership

| Field | Type | Notes |
|---|---|---|
| id | UUIDField | Primary key |
| team | ForeignKey(Team) | |
| user | ForeignKey(User) | |
| role | CharField | Enum: LEAD, MEMBER |
| joined_at | DateTimeField | Auto |

#### Project

| Field | Type | Notes |
|---|---|---|
| id | UUIDField | Primary key |
| organization | ForeignKey(Organization) | |
| team | ForeignKey(Team) | |
| name | CharField | |
| slug | SlugField | Unique within org |
| description | TextField | Markdown, nullable |
| status | CharField | Enum: BACKLOG, PLANNED, IN_PROGRESS, PAUSED, COMPLETED, CANCELED |
| priority | CharField | Enum: NONE, URGENT, HIGH, MEDIUM, LOW |
| lead | ForeignKey(User) | |
| start_date | DateField | Nullable |
| target_date | DateField | Nullable |
| completed_at | DateTimeField | Nullable |
| sort_order | IntegerField | For drag-and-drop reordering |
| icon | CharField | Nullable |
| color | CharField | Nullable, hex color |
| created_at | DateTimeField | Auto |
| updated_at | DateTimeField | Auto |

#### ProjectMembership

| Field | Type | Notes |
|---|---|---|
| id | UUIDField | Primary key |
| project | ForeignKey(Project) | |
| user | ForeignKey(User) | |
| role | CharField | Enum: LEAD, CONTRIBUTOR, REVIEWER |
| joined_at | DateTimeField | Auto |

#### Milestone

| Field | Type | Notes |
|---|---|---|
| id | UUIDField | Primary key |
| project | ForeignKey(Project) | |
| name | CharField | |
| description | TextField | Nullable |
| target_date | DateField | Nullable |
| status | CharField | Enum: PLANNED, IN_PROGRESS, COMPLETED |
| sort_order | IntegerField | |
| created_at | DateTimeField | Auto |
| updated_at | DateTimeField | Auto |

#### Cycle

Time-boxed iterations (like sprints).

| Field | Type | Notes |
|---|---|---|
| id | UUIDField | Primary key |
| project | ForeignKey(Project) | |
| name | CharField | |
| number | IntegerField | Auto-incremented per project |
| start_date | DateField | |
| end_date | DateField | |
| status | CharField | Enum: PLANNED, ACTIVE, COMPLETED |
| created_at | DateTimeField | Auto |
| updated_at | DateTimeField | Auto |

#### Issue

| Field | Type | Notes |
|---|---|---|
| id | UUIDField | Primary key |
| project | ForeignKey(Project) | |
| milestone | ForeignKey(Milestone) | Nullable |
| cycle | ForeignKey(Cycle) | Nullable |
| parent | ForeignKey(self) | Nullable, for sub-issues |
| identifier | CharField | Auto-generated: "{team.identifier}-{seq}", e.g. "ENG-123" |
| title | CharField | |
| description | TextField | Markdown, nullable |
| status | CharField | Enum: BACKLOG, TODO, IN_PROGRESS, IN_REVIEW, DONE, CANCELED |
| priority | CharField | Enum: NONE, URGENT, HIGH, MEDIUM, LOW |
| assignee | ForeignKey(User) | Nullable |
| reporter | ForeignKey(User) | |
| estimate | IntegerField | Story points, nullable |
| due_date | DateField | Nullable |
| sort_order | IntegerField | |
| external_tracker_name | CharField | Nullable, e.g. "Jira", "Linear" |
| external_tracker_url | URLField | Nullable, direct link to client's task |
| external_tracker_id | CharField | Nullable, e.g. "PROJ-456" |
| created_at | DateTimeField | Auto |
| updated_at | DateTimeField | Auto |

**Relations:**
- `labels` → M2M(Label)

#### IssueComment

| Field | Type | Notes |
|---|---|---|
| id | UUIDField | Primary key |
| issue | ForeignKey(Issue) | |
| author | ForeignKey(User) | |
| body | TextField | Markdown |
| edited_at | DateTimeField | Nullable |
| created_at | DateTimeField | Auto |
| updated_at | DateTimeField | Auto |

#### IssueActivity

Audit log for issue changes.

| Field | Type | Notes |
|---|---|---|
| id | UUIDField | Primary key |
| issue | ForeignKey(Issue) | |
| user | ForeignKey(User) | |
| action | CharField | e.g. "status_changed", "assigned", "commented" |
| field_changed | CharField | Nullable |
| old_value | TextField | Nullable |
| new_value | TextField | Nullable |
| created_at | DateTimeField | Auto |

#### Label

Organization-level labels shared across projects.

| Field | Type | Notes |
|---|---|---|
| id | UUIDField | Primary key |
| organization | ForeignKey(Organization) | |
| name | CharField | |
| color | CharField | Hex color |
| description | TextField | Nullable |
| created_at | DateTimeField | Auto |
| updated_at | DateTimeField | Auto |

#### ProjectSettings

One-to-one with Project.

| Field | Type | Notes |
|---|---|---|
| id | UUIDField | Primary key |
| project | OneToOneField(Project) | |
| repository_url | URLField | Nullable |
| repository_credential | ForeignKey(RepositoryCredential) | Nullable |
| default_branch | CharField | Default "main" |
| environment_variables | EncryptedJSONField | Encrypted at rest |
| branch_naming_convention | CharField | Nullable, e.g. "feature/{identifier}-{slug}" |
| required_reviewers_count | IntegerField | Default 1 |
| auto_close_completed_issues | BooleanField | Default False |
| issue_prefix_override | CharField | Nullable |
| estimation_method | CharField | Enum: STORY_POINTS, T_SHIRT, HOURS. Default STORY_POINTS |
| updated_at | DateTimeField | Auto |

#### Additional Project-Level Configurations

- **Deployment environments:** List of environments (dev, staging, prod) with URLs
- **Notification rules:** Which events trigger notifications and to whom
- **Issue templates:** Predefined templates for common issue types (bug, feature, task)

### 6.4 Agents App (`agents`)

#### Agent

| Field | Type | Notes |
|---|---|---|
| id | UUIDField | Primary key |
| organization | ForeignKey(Organization) | |
| name | CharField | e.g. "Agent-Alpha", "Backend Builder" |
| slug | SlugField | Unique within org |
| description | TextField | Nullable |
| version | CharField | Semver, e.g. "1.2.0" |
| status | CharField | Enum: DRAFT, ACTIVE, INACTIVE, DEPRECATED |
| agent_type | CharField | Enum: CODER, REVIEWER, TESTER, PLANNER, CUSTOM |
| capabilities | JSONField | Structured list, e.g. ["python", "django", "postgres"] |
| configuration | EncryptedJSONField | Agent-specific config (model, temperature, etc.) |
| max_concurrent_tasks | IntegerField | Default 1 |
| created_by | ForeignKey(User) | |
| tags | ArrayField(CharField) | Free-form tags |
| created_at | DateTimeField | Auto |
| updated_at | DateTimeField | Auto |

**Relations:**
- `assigned_projects` → M2M(Project)
- `skills` → M2M(Skill, through=AgentSkill)

#### Skill

| Field | Type | Notes |
|---|---|---|
| id | UUIDField | Primary key |
| organization | ForeignKey(Organization) | |
| name | CharField | e.g. "Django Migration Expert" |
| slug | SlugField | Unique within org |
| description | TextField | |
| version | CharField | Semver |
| status | CharField | Enum: DRAFT, ACTIVE, INACTIVE, DEPRECATED |
| content | TextField | Markdown instructions |
| category | CharField | Enum: CODING, TESTING, REVIEW, DOCUMENTATION, DEPLOYMENT, CUSTOM |
| input_schema | JSONField | Nullable, defines expected inputs |
| output_schema | JSONField | Nullable, defines expected outputs |
| compatible_agent_types | ArrayField(CharField) | Which agent_types can use this skill |
| created_by | ForeignKey(User) | |
| tags | ArrayField(CharField) | Free-form tags |
| created_at | DateTimeField | Auto |
| updated_at | DateTimeField | Auto |

#### AgentSkill

Join table between Agent and Skill with configuration.

| Field | Type | Notes |
|---|---|---|
| id | UUIDField | Primary key |
| agent | ForeignKey(Agent) | |
| skill | ForeignKey(Skill) | |
| priority | IntegerField | Order in which agent applies skills |
| is_enabled | BooleanField | Default True |
| custom_config | JSONField | Nullable, per-agent overrides |
| assigned_at | DateTimeField | Auto |

#### SkillVersion

Version history for skill content.

| Field | Type | Notes |
|---|---|---|
| id | UUIDField | Primary key |
| skill | ForeignKey(Skill) | |
| version | CharField | Semver |
| content | TextField | Markdown snapshot |
| changelog | TextField | Description of changes |
| created_by | ForeignKey(User) | |
| created_at | DateTimeField | Auto |

## 7. Import System

### Plugin Architecture

Each external tool integration implements a standard `ImportPlugin` interface:

```python
class ImportPlugin(ABC):
    provider: str

    @abstractmethod
    def authenticate(self, credentials: dict) -> bool: ...

    @abstractmethod
    def list_projects(self, connection) -> list[ExternalProject]: ...

    @abstractmethod
    def fetch_project(self, project_id: str) -> ProjectData: ...

    @abstractmethod
    def fetch_issues(self, project_id: str) -> list[IssueData]: ...

    @abstractmethod
    def map_to_internal(self, external_data) -> InternalModel: ...
```

Supported providers (extensible): LINEAR, JIRA, TRELLO, ASANA, GITHUB_PROJECTS.

### ImportJob

Tracks the execution of an import operation.

| Field | Type | Notes |
|---|---|---|
| id | UUIDField | Primary key |
| organization | ForeignKey(Organization) | |
| target_project | ForeignKey(Project) | Nullable (null = create new project) |
| provider | CharField | Enum of supported providers |
| status | CharField | Enum: PENDING, IN_PROGRESS, COMPLETED, FAILED, PARTIALLY_COMPLETED |
| config | JSONField | Import options (what to include/exclude) |
| progress | IntegerField | 0-100 percentage |
| total_items | IntegerField | |
| imported_items | IntegerField | |
| error_log | JSONField | List of errors/warnings |
| started_by | ForeignKey(User) | |
| started_at | DateTimeField | Nullable |
| completed_at | DateTimeField | Nullable |
| created_at | DateTimeField | Auto |

### ImportMapping

Maps external IDs to internal UUIDs for deduplication and traceability.

| Field | Type | Notes |
|---|---|---|
| id | UUIDField | Primary key |
| import_job | ForeignKey(ImportJob) | |
| external_id | CharField | ID from the external system |
| external_type | CharField | e.g. "issue", "label", "user" |
| internal_id | UUIDField | Corresponding internal UUID |
| internal_type | CharField | e.g. "Issue", "Label" |
| created_at | DateTimeField | Auto |

## 8. API Design

All endpoints are prefixed with `/api/v1/`.

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/login/` | Obtain JWT access + refresh tokens |
| POST | `/auth/refresh/` | Refresh JWT access token |
| POST | `/auth/register/` | Register new user |
| GET | `/auth/me/` | Get current authenticated user |

### Organizations

| Method | Endpoint | Description |
|---|---|---|
| GET/POST | `/organizations/` | List / Create organizations |
| GET/PUT/DELETE | `/organizations/{org_slug}/` | Get / Update / Delete organization |
| GET/POST | `/organizations/{org_slug}/members/` | List / Add members |
| PUT/DELETE | `/organizations/{org_slug}/members/{user_id}/` | Update role / Remove member |
| GET/PUT | `/organizations/{org_slug}/settings/` | Get / Update org settings |
| CRUD | `/organizations/{org_slug}/credentials/` | Manage repo credentials |
| CRUD | `/organizations/{org_slug}/integrations/` | Manage integrations |

### Teams

| Method | Endpoint | Description |
|---|---|---|
| GET/POST | `/organizations/{org_slug}/teams/` | List / Create teams |
| GET/PUT/DELETE | `/organizations/{org_slug}/teams/{team_slug}/` | Get / Update / Delete team |
| CRUD | `/organizations/{org_slug}/teams/{team_slug}/members/` | Manage team members |

### Projects

| Method | Endpoint | Description |
|---|---|---|
| GET/POST | `/organizations/{org_slug}/projects/` | List / Create projects |
| GET/PUT/DELETE | `/organizations/{org_slug}/projects/{project_slug}/` | Get / Update / Delete project |
| GET/PUT | `/organizations/{org_slug}/projects/{project_slug}/settings/` | Project settings |
| CRUD | `/organizations/{org_slug}/projects/{project_slug}/milestones/` | Manage milestones |
| CRUD | `/organizations/{org_slug}/projects/{project_slug}/cycles/` | Manage cycles |
| CRUD | `/organizations/{org_slug}/projects/{project_slug}/issues/` | Manage issues |
| CRUD | `/organizations/{org_slug}/projects/{project_slug}/issues/{identifier}/comments/` | Issue comments |
| GET | `/organizations/{org_slug}/projects/{project_slug}/issues/{identifier}/activity/` | Issue activity log |
| POST | `/organizations/{org_slug}/projects/{project_slug}/import/` | Trigger import job |

### Labels

| Method | Endpoint | Description |
|---|---|---|
| CRUD | `/organizations/{org_slug}/labels/` | Manage org-level labels |

### Agents & Skills

| Method | Endpoint | Description |
|---|---|---|
| CRUD | `/organizations/{org_slug}/agents/` | Manage agents |
| GET/PUT/DELETE | `/organizations/{org_slug}/agents/{agent_slug}/` | Single agent |
| CRUD | `/organizations/{org_slug}/agents/{agent_slug}/skills/` | Manage agent-skill assignments |
| CRUD | `/organizations/{org_slug}/skills/` | Manage skills |
| GET/PUT/DELETE | `/organizations/{org_slug}/skills/{skill_slug}/` | Single skill |
| GET | `/organizations/{org_slug}/skills/{skill_slug}/versions/` | Skill version history |

### Imports

| Method | Endpoint | Description |
|---|---|---|
| GET | `/imports/{job_id}/` | Import job status |
| GET | `/imports/{job_id}/log/` | Import error log |

### WebSocket Endpoints (Future Phase)

| Endpoint | Description |
|---|---|
| `ws/agents/{agent_id}/` | Agent <-> Server bidirectional communication |
| `ws/projects/{project_id}/` | Live updates for project boards |

## 9. Entity Relationship Summary

```
User ──M2M──> Organization     (via OrganizationMembership)
User ──M2M──> Team             (via TeamMembership)
User ──M2M──> Project          (via ProjectMembership)

Organization ──1:1──> OrganizationSettings
Organization ──1:N──> RepositoryCredential
Organization ──1:N──> IntegrationConfig
Organization ──1:N──> Team
Organization ──1:N──> Project
Organization ──1:N──> Label
Organization ──1:N──> Agent
Organization ──1:N──> Skill
Organization ──1:N──> ImportJob

Team ──1:N──> Project

Project ──1:1──> ProjectSettings
Project ──1:N──> Milestone
Project ──1:N──> Cycle
Project ──1:N──> Issue

Issue ──1:N──> IssueComment
Issue ──1:N──> IssueActivity
Issue ──M2M──> Label
Issue ──self──> Issue           (parent/sub-issues)

Agent ──M2M──> Skill           (via AgentSkill)
Agent ──M2M──> Project         (assigned_projects)

Skill ──1:N──> SkillVersion

ImportJob ──1:N──> ImportMapping
```
