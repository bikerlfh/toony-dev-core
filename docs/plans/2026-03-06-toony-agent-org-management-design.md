# Toony Agent - Organization Bidirectional Management

**Date:** 2026-03-06
**Status:** Approved

## Goal

Add frontend (and minimal backend) support for managing the M2M relationship between ToonyAgent and Organization from both directions:
- From **Toony Agent Detail**: manage which organizations the agent is deployed to
- From **Organization Detail**: manage which agents are available in the org

## Current State

- `ToonyAgent.organizations` M2M field exists (backend model)
- Backend supports: `organization_id` on create, `organization_ids` on update, `?organization` query filter
- Output serializers do NOT include organizations
- Frontend has no UI for this relationship

## Backend Changes

### 1. ToonyAgentDetailSerializer — add `organizations`
- Add nested `organizations` field (list of objects: `id`, `name`, `slug`)
- Create or reuse a minimal Organization serializer for the nested representation

### 2. No new endpoints needed
- `GET /api/toony-agents/?organization={org_id}` — list agents for an org (already exists)
- `PUT /api/toony-agents/{id}/` with `organization_ids` — set orgs (already exists)

## Frontend Changes

### Toony Agent Detail — "Organizations" Section
- New section below the stats bento grid
- Lists associated organizations (name, slug, industry)
- **"Add Organization"** button opens modal with dropdown of user's orgs not already associated
- **"Remove"** button per row opens confirmation modal, then PUTs updated `organization_ids`

### Organization Detail — "Agents" Tab (7th tab)
- New tab after "Imports"
- Lists associated toony agents (name, slug, status badge)
- **"Add Agent"** button opens modal with dropdown of accessible agents not already in the org
- **"Remove"** button per row opens confirmation modal, then PUTs updated `organization_ids` to the agent

### Data Flow (both directions)
1. Add: calculate new `organization_ids` array, PUT to agent endpoint, refresh list
2. Remove: confirmation modal, calculate new array without removed id, PUT, refresh

### New Frontend API Functions
- `listToonyAgentsByOrganization(orgId)` — GET `/toony-agents/?organization={orgId}`

### TypeScript Type Changes
- Add `organizations: { id: string; name: string; slug: string }[]` to `ToonyAgentDetail`
