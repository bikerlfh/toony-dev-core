# Toony Dev Core — Implementation Phases

Tracking document for the phased implementation of Toony Dev Core.
Full design: [`docs/2026-03-01-toony-dev-core-design.md`](../2026-03-01-toony-dev-core-design.md)

## Instructions

- After generating the implementation plan for a phase, mark the **Plan Generated** column with `✅`.
- After fully implementing a phase, mark the **Implemented** column with `✅`.
- The generated plan for each phase must be saved as a file in `docs/plans/` (e.g., `docs/plans/phase-01-bootstrap.md`).
- Update this file as part of the same commit that completes the plan or implementation.

| # | Phase | Description | Plan Generated | Implemented |
|---|-------|-------------|:--------------:|:-----------:|
| 1 | Project Bootstrap & Infrastructure | Docker, Django project, Next.js init, PostgreSQL/Redis, settings, health check | ✅ | ✅ |
| 2 | Custom User Model & JWT Auth | Custom User (AbstractUser), JWT endpoints (register, login, refresh, me) | ✅ | ✅ |
| 3 | Organizations, Memberships & RBAC | Organization CRUD, OrganizationMembership, RBAC permissions (5 roles), OrganizationSettings | ✅ | ✅ |
| 4 | Frontend Foundation — Auth & Org Shell | Next.js auth pages, JWT handling, org selector, sidebar layout, member management UI | ✅ | ✅ |
| 5 | Teams & Labels (Backend) | Team/TeamMembership CRUD, org-level Label CRUD | ✅ | ✅ |
| 6 | Projects, Milestones & Cycles (Backend) | Project/ProjectMembership, ProjectSettings, Milestone, Cycle CRUD | ✅ | ✅ |
| 7 | Issues, Comments & Activity Log (Backend) | Issue with auto-identifier, IssueComment, IssueActivity audit log, Label M2M | ✅ | ✅ |
| 8 | Frontend — Teams, Projects & Labels UI | Team/project pages, milestone/cycle UI, label management, sidebar navigation | ✅ | ✅ |
| 9 | Frontend — Issue Tracker UI | Kanban board, list view, issue detail, comments, activity timeline, filtering | ✅ | ✅ |
| 10 | Credentials & Integration Config | RepositoryCredential (encrypted), IntegrationConfig, backend + frontend | ✅ | ✅ |
| 11 | Agents & Skills Registry | Agent, Skill, SkillVersion, AgentSkill models, backend + frontend | ✅ | ✅ |
| 12 | Import System — Plugin Architecture | ImportPlugin ABC, LinearPlugin, ImportJob, ImportMapping, import wizard UI | ✅ | ✅ |
| 13 | Multi-Tenancy Hardening, Pagination & Search | Org-scoped query isolation, cursor pagination, full-text search, global search UI | ✅ | ✅ |
| 14 | WebSocket Infrastructure & Real-Time | Django Channels, project board live updates, agent communication WebSocket | ✅ | ✅ |
| 15 | Polish, Testing Suite & Deployment | CI/CD pipeline, API docs (Swagger), production Docker, comprehensive tests, seed data | | |
