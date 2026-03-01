# Phase 4: Frontend Foundation — Auth & Org Shell

## Context

Phases 1-3 delivered the full backend: Django 5 + DRF with JWT auth (register, login, refresh, me), Organization CRUD, Membership management with RBAC (5 roles: OWNER, ADMIN, MANAGER, MEMBER, VIEWER), and OrganizationSettings. The frontend contained only a placeholder home page, a root layout, a global CSS import, and an Axios instance at `frontend/lib/api.ts` with stub interceptors.

Phase 4 builds the complete frontend foundation: authentication pages, JWT token management with automatic refresh, React Context providers for auth and org state, Next.js middleware for route protection, a persistent sidebar shell layout scoped to `/{org_slug}/...`, an organization selector/switcher, member management UI, and a basic org settings page.

---

## Plan

### A. TypeScript Types/Interfaces

1. `frontend/types/auth.ts` — User, AuthTokens, AuthResponse, LoginCredentials, RegisterCredentials
2. `frontend/types/organization.ts` — Organization, OrganizationDetail, Member, MembershipRole, OrganizationSettings, payloads
3. `frontend/types/index.ts` — barrel re-export

### B. API Client Layer

4. `frontend/lib/api.ts` — Upgraded interceptors (request: attach Bearer token, response: 401 silent refresh with queue)
5. `frontend/lib/api/auth.ts` — login(), register(), refreshToken(), getMe()
6. `frontend/lib/api/organizations.ts` — listOrganizations(), createOrganization(), getOrganization(), updateOrganization(), deleteOrganization()
7. `frontend/lib/api/members.ts` — listMembers(), addMember(), updateMemberRole(), removeMember()
8. `frontend/lib/api/settings.ts` — getOrganizationSettings(), updateOrganizationSettings()
9. `frontend/lib/api/index.ts` — barrel re-export

### C. Auth Context & Hooks

10. `frontend/lib/auth.ts` — Token utilities (localStorage + cookie signal)
11. `frontend/contexts/auth-context.tsx` — AuthProvider + useAuth()

### D. Org Context & Hooks

12. `frontend/contexts/org-context.tsx` — OrgProvider + useOrg()
13. `frontend/lib/roles.ts` — ROLE_HIERARCHY, hasMinRole(), canManageMembers(), canEditOrg(), canDeleteOrg()

### E. Next.js Middleware

14. `frontend/middleware.ts` — Route protection via toony_authenticated cookie

### F. Auth Pages

15. `frontend/app/(auth)/layout.tsx` — Centered card layout
16. `frontend/app/(auth)/login/page.tsx` — Login form with redirect support
17. `frontend/app/(auth)/register/page.tsx` — Register form

### G. App Shell Layout

18. `frontend/app/layout.tsx` — Wrapped with AuthProvider
19. `frontend/app/page.tsx` — Landing/redirect logic
20. `frontend/app/(dashboard)/[orgSlug]/layout.tsx` — OrgProvider + sidebar
21. `frontend/components/sidebar.tsx` — Navigation sidebar
22. `frontend/components/org-switcher.tsx` — Dropdown org selector
23. `frontend/components/create-org-modal.tsx` — Create organization modal
24. `frontend/app/(dashboard)/[orgSlug]/page.tsx` — Dashboard placeholder

### H. Member Management

25. `frontend/app/(dashboard)/[orgSlug]/members/page.tsx` — Members table with RBAC-gated actions
26. `frontend/components/add-member-modal.tsx` — Add member modal
27. `frontend/components/change-role-modal.tsx` — Change role modal
28. `frontend/components/confirm-modal.tsx` — Reusable confirmation modal

### I. Org Settings Page

29. `frontend/app/(dashboard)/[orgSlug]/settings/page.tsx` — Settings form + danger zone

---

## File Manifest

**24 new files, 3 modified files:**

| Section | Files |
|---------|-------|
| A (Types) | `frontend/types/auth.ts`, `frontend/types/organization.ts`, `frontend/types/index.ts` |
| B (API) | `frontend/lib/api.ts` (modify), `frontend/lib/api/auth.ts`, `frontend/lib/api/organizations.ts`, `frontend/lib/api/members.ts`, `frontend/lib/api/settings.ts`, `frontend/lib/api/index.ts` |
| C (Auth) | `frontend/lib/auth.ts`, `frontend/contexts/auth-context.tsx` |
| D (Org) | `frontend/contexts/org-context.tsx`, `frontend/lib/roles.ts` |
| E (Middleware) | `frontend/middleware.ts` |
| F (Auth Pages) | `frontend/app/(auth)/layout.tsx`, `frontend/app/(auth)/login/page.tsx`, `frontend/app/(auth)/register/page.tsx` |
| G (Shell) | `frontend/app/layout.tsx` (modify), `frontend/app/page.tsx` (modify), `frontend/app/(dashboard)/[orgSlug]/layout.tsx`, `frontend/components/sidebar.tsx`, `frontend/components/org-switcher.tsx`, `frontend/components/create-org-modal.tsx`, `frontend/app/(dashboard)/[orgSlug]/page.tsx` |
| H (Members) | `frontend/app/(dashboard)/[orgSlug]/members/page.tsx`, `frontend/components/add-member-modal.tsx`, `frontend/components/change-role-modal.tsx`, `frontend/components/confirm-modal.tsx` |
| I (Settings) | `frontend/app/(dashboard)/[orgSlug]/settings/page.tsx` |

---

## Key Architectural Decisions

1. **localStorage + cookie signal:** Tokens in localStorage for Axios; lightweight `toony_authenticated` cookie for middleware route protection (no actual token in cookie).
2. **URL-driven org context:** Current org derived from `[orgSlug]` URL param — bookmarkable, shareable, history-friendly.
3. **Zero new dependencies:** Built entirely with React 19, Next.js 15, Tailwind CSS 4, and Axios.
4. **Modals for member actions:** Add/change-role/remove use modals for snappy UX.
5. **Client-side role checks for UI only:** `lib/roles.ts` controls UI visibility; backend enforces RBAC independently.
