# Phase 8: Frontend — Teams, Projects & Labels UI

## Context

Phases 1-7 delivered the full backend (Teams, Labels, Projects, Milestones, Cycles, Issues, Comments, Activity Log) and the frontend foundation (Auth, Org Shell, Members, Settings). Phase 8 builds the frontend UI for managing teams, projects (with milestones, cycles, members, settings tabs), and labels — all scoped to the current organization.

**Design doc:** `docs/2026-03-01-toony-dev-core-design.md`

---

## Plan

### A. TypeScript Types

1. **`frontend/types/projects.ts`** — All project-domain types matching backend output serializers:
   - Team, TeamDetail, TeamMember, TeamRole + CRUD payloads
   - Label + CRUD payloads
   - ProjectList, ProjectDetail, ProjectMember, ProjectSettings, ProjectMemberRole, ProjectStatus, ProjectPriority, EstimationMethod + CRUD payloads
   - Milestone, MilestoneStatus + CRUD payloads
   - Cycle, CycleStatus + CRUD payloads

2. **`frontend/types/index.ts`** — Barrel re-export all new types

### B. API Client Layer

3. **`frontend/lib/api/teams.ts`** — listTeams, createTeam, getTeam, updateTeam, deleteTeam, listTeamMembers, addTeamMember, updateTeamMemberRole, removeTeamMember
4. **`frontend/lib/api/projects.ts`** — listProjects, createProject, getProject, updateProject, deleteProject, listProjectMembers, addProjectMember, updateProjectMemberRole, removeProjectMember, getProjectSettings, updateProjectSettings
5. **`frontend/lib/api/milestones.ts`** — listMilestones, createMilestone, getMilestone, updateMilestone, deleteMilestone
6. **`frontend/lib/api/cycles.ts`** — listCycles, createCycle, getCycle, updateCycle, deleteCycle
7. **`frontend/lib/api/labels.ts`** — listLabels, createLabel, updateLabel, deleteLabel
8. **`frontend/lib/api/index.ts`** — Barrel re-export all new API functions

### C. Sidebar, Roles & Shared Components

9. **`frontend/components/sidebar.tsx`** — Added Teams, Projects, Labels nav items
10. **`frontend/lib/roles.ts`** — Added canManageTeams (ADMIN+), canCreateProject (MANAGER+), canManageLabels (ADMIN+)
11. **`frontend/components/status-badge.tsx`** — Reusable badge for project/milestone/cycle statuses (color-coded)
12. **`frontend/components/priority-badge.tsx`** — Reusable badge for project priority (color-coded)

### D. Teams UI

13. **`frontend/components/create-team-modal.tsx`** — Create team modal with auto-slug and auto-identifier generation
14. **`frontend/app/(dashboard)/[orgSlug]/teams/page.tsx`** — Teams list page with grid cards, create/delete actions
15. **`frontend/app/(dashboard)/[orgSlug]/teams/[teamSlug]/page.tsx`** — Team detail page: inline edit, member management (add/change-role/remove), danger zone delete

### E. Projects UI

16. **`frontend/components/create-project-modal.tsx`** — Create project modal with team selector, status/priority, dates
17. **`frontend/app/(dashboard)/[orgSlug]/projects/page.tsx`** — Projects list page with table (status, priority, team, lead, target), create/delete actions
18. **`frontend/app/(dashboard)/[orgSlug]/projects/[projectSlug]/page.tsx`** — Project detail page with 5 tabs:
    - **Overview**: Project info, edit form, danger zone delete
    - **Milestones**: List/create/status-change/delete milestones
    - **Cycles**: List/create/status-change/delete cycles with date ranges
    - **Members**: List/add/change-role/remove project members
    - **Settings**: Project settings form (repo URL, branch convention, estimation method, etc.)

### F. Labels UI

19. **`frontend/app/(dashboard)/[orgSlug]/labels/page.tsx`** — Labels list with color dots, inline LabelFormModal for create/edit, delete with confirmation. Color picker with preset palette + custom hex input.

---

## File Manifest

**15 new files, 4 modified files:**

| Section | Files |
|---------|-------|
| A (Types) | `frontend/types/projects.ts` (new), `frontend/types/index.ts` (modify) |
| B (API) | `frontend/lib/api/teams.ts` (new), `frontend/lib/api/projects.ts` (new), `frontend/lib/api/milestones.ts` (new), `frontend/lib/api/cycles.ts` (new), `frontend/lib/api/labels.ts` (new), `frontend/lib/api/index.ts` (modify) |
| C (Shared) | `frontend/components/sidebar.tsx` (modify), `frontend/lib/roles.ts` (modify), `frontend/components/status-badge.tsx` (new), `frontend/components/priority-badge.tsx` (new) |
| D (Teams) | `frontend/components/create-team-modal.tsx` (new), `frontend/app/(dashboard)/[orgSlug]/teams/page.tsx` (new), `frontend/app/(dashboard)/[orgSlug]/teams/[teamSlug]/page.tsx` (new) |
| E (Projects) | `frontend/components/create-project-modal.tsx` (new), `frontend/app/(dashboard)/[orgSlug]/projects/page.tsx` (new), `frontend/app/(dashboard)/[orgSlug]/projects/[projectSlug]/page.tsx` (new) |
| F (Labels) | `frontend/app/(dashboard)/[orgSlug]/labels/page.tsx` (new) |

---

## Key Decisions

1. **Tab-based project detail** — Overview, Milestones, Cycles, Members, Settings rendered as client-side tabs (no extra routes), keeping URL simple at `/{orgSlug}/projects/{slug}`.
2. **Inline modals for all create/edit** — Consistent with Phase 4 member management pattern.
3. **Color picker with presets** — 10 preset colors + native color input + hex text for labels.
4. **Role-gated UI** — canManageTeams (ADMIN+), canCreateProject (MANAGER+), canManageLabels (ADMIN+) control button/action visibility. Backend RBAC enforces independently.
5. **Zero new dependencies** — Built with React 19, Next.js 15, Tailwind CSS 4, Axios only.
6. **Direct role-change via select** — Team and project member roles use inline `<select>` dropdowns instead of modal for faster workflow.

---

## Verification

1. `./node_modules/.bin/next build` — all pages compile without TypeScript errors
2. `/{orgSlug}/teams` — teams list, create team, click into team detail
3. `/{orgSlug}/teams/{slug}` — edit team, manage members (add/change-role/remove), delete team
4. `/{orgSlug}/projects` — projects table with status/priority badges, create project, delete
5. `/{orgSlug}/projects/{slug}` — overview tab, edit project, milestones tab, cycles tab, members tab, settings tab
6. `/{orgSlug}/labels` — label list with color dots, create/edit/delete labels, color picker
7. Sidebar shows Teams, Projects, Labels, Members, Settings links with active highlighting
8. RBAC: viewers see read-only UI, admins see management actions
