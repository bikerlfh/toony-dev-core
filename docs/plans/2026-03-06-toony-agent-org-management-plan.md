# Toony Agent - Organization Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add bidirectional UI for managing the M2M relationship between ToonyAgent and Organization — from the agent detail page and from the org detail page.

**Architecture:** Backend change adds `organizations` to the ToonyAgent detail serializer. Frontend adds an "Organizations" section to the toony agent detail page and an "Agents" tab to the organization detail page. Both use the existing `PUT /api/toony-agents/{id}/` endpoint with `organization_ids` to manage the relationship.

**Tech Stack:** Django 5 / DRF (backend serializer), Next.js 15 / React 19 / Tailwind CSS v4 (frontend), TypeScript

**Working directory:** `/Users/LuisMo/Documents/projects/toony-dev-core-agent-org-mgmt`

---

### Task 1: Backend — Add organizations to ToonyAgentDetailSerializer

**Files:**
- Modify: `backend/toony_agents/serializers/output.py:16-35`
- Test: `backend/tests/test_toony_agents.py`

**Step 1: Write the failing test**

Add to `backend/tests/test_toony_agents.py` at the end of `TestToonyAgentAPI`:

```python
def test_get_toony_agent_includes_organizations(self, authenticated_client, organization, user):
    from toony_agents.models import ToonyAgent
    agent = ToonyAgent.objects.create(
        name="Bot", slug="org-fields-bot", registered_by=user,
    )
    agent.organizations.add(organization)
    url = toony_agent_url(agent.id)
    response = authenticated_client.get(url)
    assert response.status_code == status.HTTP_200_OK
    assert "organizations" in response.data
    assert len(response.data["organizations"]) == 1
    org_data = response.data["organizations"][0]
    assert str(organization.id) == org_data["id"]
    assert organization.name == org_data["name"]
    assert organization.slug == org_data["slug"]
```

**Step 2: Run test to verify it fails**

Run: `docker compose exec backend pytest tests/test_toony_agents.py::TestToonyAgentAPI::test_get_toony_agent_includes_organizations -v`
Expected: FAIL — `"organizations" not in response.data`

**Step 3: Add organizations to the serializer**

In `backend/toony_agents/serializers/output.py`, modify `ToonyAgentDetailSerializer`:

```python
class ToonyAgentDetailSerializer(serializers.ModelSerializer):
    registered_by = serializers.SerializerMethodField()
    organizations = serializers.SerializerMethodField()

    class Meta:
        model = ToonyAgent
        fields = [
            "id", "name", "slug", "status", "last_heartbeat",
            "last_connected_at", "metadata", "registered_by",
            "organizations", "created_at", "updated_at",
        ]
        read_only_fields = fields

    def get_registered_by(self, obj):
        u = obj.registered_by
        return {
            "id": str(u.id),
            "email": u.email,
            "first_name": u.first_name,
            "last_name": u.last_name,
        }

    def get_organizations(self, obj):
        return [
            {"id": str(o.id), "name": o.name, "slug": o.slug}
            for o in obj.organizations.all()
        ]
```

**Step 4: Run test to verify it passes**

Run: `docker compose exec backend pytest tests/test_toony_agents.py::TestToonyAgentAPI::test_get_toony_agent_includes_organizations -v`
Expected: PASS

**Step 5: Run full test suite to ensure no regressions**

Run: `docker compose exec backend pytest tests/test_toony_agents.py -v`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add backend/toony_agents/serializers/output.py backend/tests/test_toony_agents.py
git commit -m "feat(toony-agents): add organizations to detail serializer output"
```

---

### Task 2: Frontend — Update TypeScript types and API functions

**Files:**
- Modify: `frontend/types/toony-agents.ts:31-39`
- Modify: `frontend/lib/api/toony-agents.ts` (add new function at end)

**Step 1: Add `organizations` to `ToonyAgentDetail` type**

In `frontend/types/toony-agents.ts`, update the `ToonyAgentDetail` interface (line 31):

```typescript
export interface ToonyAgentDetail extends ToonyAgentList {
  registered_by: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
  };
  organizations: {
    id: string;
    name: string;
    slug: string;
  }[];
  updated_at: string;
}
```

**Step 2: Add `listToonyAgentsByOrganization` API function**

In `frontend/lib/api/toony-agents.ts`, add after the `deleteToonyAgent` function (after line 63):

```typescript
export async function listToonyAgentsByOrganization(
  orgId: string
): Promise<PaginatedResponse<ToonyAgentList>> {
  const { data } = await api.get<PaginatedResponse<ToonyAgentList>>(
    `/toony-agents/`,
    { params: { organization: orgId } }
  );
  return data;
}
```

**Step 3: Commit**

```bash
git add frontend/types/toony-agents.ts frontend/lib/api/toony-agents.ts
git commit -m "feat(frontend): update ToonyAgentDetail type and add org filter API"
```

---

### Task 3: Frontend — Add Organizations section to Toony Agent Detail page

**Files:**
- Modify: `frontend/app/(dashboard)/toony-agents/[id]/page.tsx`

This task adds an "Organizations" section below the stats bento grid on the agent detail page. It includes:
- A list of associated organizations
- An "Add Organization" button that opens a modal
- A "Remove" button per row that opens a confirmation modal

**Step 1: Add state and imports**

At the top of `frontend/app/(dashboard)/toony-agents/[id]/page.tsx`:

- Add `listOrganizations` to imports (from `@/lib/api/organizations`)
- Add `updateToonyAgent` to the existing toony-agents import (line 6)
- Add `ConfirmModal` import (from `@/components/confirm-modal`)
- Add `Organization` to the types import

Inside the component, add new state variables after the existing ones (after line 93):

```typescript
const [showAddOrgModal, setShowAddOrgModal] = useState(false);
const [allOrgs, setAllOrgs] = useState<Organization[]>([]);
const [selectedOrgId, setSelectedOrgId] = useState("");
const [addOrgLoading, setAddOrgLoading] = useState(false);
const [removeOrgAgent, setRemoveOrgAgent] = useState<{ id: string; name: string } | null>(null);
const [removeOrgLoading, setRemoveOrgLoading] = useState(false);
```

**Step 2: Add the fetchOrgs function and the add/remove handlers**

After the existing `fetchTasks` callback:

```typescript
const fetchAvailableOrgs = useCallback(async () => {
  try {
    const res = await listOrganizations();
    setAllOrgs(res.results);
  } catch {
    // silent
  }
}, []);
```

Add `fetchAvailableOrgs` to the `useEffect` call on line 114-117:

```typescript
useEffect(() => {
  fetchAgent();
  fetchTasks();
  fetchAvailableOrgs();
}, [fetchAgent, fetchTasks, fetchAvailableOrgs]);
```

Add handlers for add and remove:

```typescript
const availableOrgs = useMemo(() => {
  if (!agent) return [];
  const assignedIds = new Set(agent.organizations.map((o) => o.id));
  return allOrgs.filter((o) => !assignedIds.has(o.id));
}, [allOrgs, agent]);

async function handleAddOrg() {
  if (!agent || !selectedOrgId) return;
  setAddOrgLoading(true);
  try {
    const newIds = [...agent.organizations.map((o) => o.id), selectedOrgId];
    await updateToonyAgent(agentId, { organization_ids: newIds });
    await fetchAgent();
    setShowAddOrgModal(false);
    setSelectedOrgId("");
  } catch {
    // silent
  } finally {
    setAddOrgLoading(false);
  }
}

async function handleRemoveOrg() {
  if (!agent || !removeOrgAgent) return;
  setRemoveOrgLoading(true);
  try {
    const newIds = agent.organizations
      .filter((o) => o.id !== removeOrgAgent.id)
      .map((o) => o.id);
    await updateToonyAgent(agentId, { organization_ids: newIds });
    await fetchAgent();
    setRemoveOrgAgent(null);
  } catch {
    // silent
  } finally {
    setRemoveOrgLoading(false);
  }
}
```

**Step 3: Add the Organizations section JSX**

Insert between the stats bento grid (ends at line 307) and the Tasks section (starts at line 309):

```tsx
{/* ── Organizations section ───────────────────────────── */}
<div className="mt-8">
  <div className="flex items-center justify-between">
    <h2 className="text-base font-medium text-white">Organizations</h2>
    <button
      onClick={() => setShowAddOrgModal(true)}
      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-600 hover:text-white"
    >
      + Add Organization
    </button>
  </div>
  <p className="mt-3 text-xs text-slate-600">
    {agent.organizations.length} organization{agent.organizations.length !== 1 && "s"}
  </p>
  {agent.organizations.length === 0 ? (
    <div className="mt-6 text-center">
      <p className="text-sm text-slate-500">Not assigned to any organization.</p>
    </div>
  ) : (
    <div className="mt-3 space-y-2">
      {agent.organizations.map((org) => (
        <div
          key={org.id}
          className="flex items-center justify-between rounded-lg border border-slate-800/60 bg-slate-900 px-4 py-3"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-200">{org.name}</p>
            <p className="mt-0.5 font-mono text-xs text-slate-600">{org.slug}</p>
          </div>
          <button
            onClick={() => setRemoveOrgAgent({ id: org.id, name: org.name })}
            className="shrink-0 rounded-md px-2.5 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  )}
</div>
```

**Step 4: Add the Add Organization modal and Remove confirmation modal JSX**

Insert after the existing `CreateTaskModal` (after line 417), before the closing `</div>`:

```tsx
{/* ── Add Organization Modal ─────────────────────────── */}
{showAddOrgModal && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    onClick={(e) => { if (e.target === e.currentTarget) { setShowAddOrgModal(false); setSelectedOrgId(""); } }}
  >
    <div className="w-full max-w-sm rounded-xl border border-slate-800/60 bg-slate-900 p-6">
      <h2 className="text-base font-medium tracking-tight text-white">Add Organization</h2>
      <p className="mt-1 text-sm text-slate-500">Select an organization to assign this agent to.</p>
      <select
        value={selectedOrgId}
        onChange={(e) => setSelectedOrgId(e.target.value)}
        className="mt-4 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
      >
        <option value="">Select organization...</option>
        {availableOrgs.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
      <div className="mt-5 flex justify-end gap-3">
        <button
          type="button"
          onClick={() => { setShowAddOrgModal(false); setSelectedOrgId(""); }}
          className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleAddOrg}
          disabled={!selectedOrgId || addOrgLoading}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
        >
          {addOrgLoading ? "Adding..." : "Add"}
        </button>
      </div>
    </div>
  </div>
)}

{/* ── Remove Organization Confirm ────────────────────── */}
{removeOrgAgent && (
  <ConfirmModal
    title="Remove Organization"
    message={`Remove "${removeOrgAgent.name}" from this agent? The agent will no longer be accessible to members of that organization.`}
    confirmLabel="Remove"
    confirmVariant="danger"
    isLoading={removeOrgLoading}
    onConfirm={handleRemoveOrg}
    onCancel={() => setRemoveOrgAgent(null)}
  />
)}
```

**Step 5: Verify the frontend builds**

Run: `docker compose exec frontend ./node_modules/.bin/next build`
Expected: Build succeeds without errors

**Step 6: Commit**

```bash
git add frontend/app/\(dashboard\)/toony-agents/\[id\]/page.tsx
git commit -m "feat(frontend): add organizations section to toony agent detail page"
```

---

### Task 4: Frontend — Add Agents tab to Organization Detail page

**Files:**
- Modify: `frontend/app/(dashboard)/organizations/[id]/page.tsx`

This task adds a 7th "Agents" tab to the organization detail page that lists associated toony agents with add/remove functionality.

**Step 1: Update imports and Tab type**

In `frontend/app/(dashboard)/organizations/[id]/page.tsx`:

Add to the imports at top:
```typescript
import { listToonyAgentsByOrganization, listToonyAgents, updateToonyAgent } from "@/lib/api/toony-agents";
```

Add to the types import:
```typescript
import type {
  // ... existing types ...
  ToonyAgentList,
  ToonyAgentDetail,
  ToonyAgentStatus,
} from "@/types";
```

**Step 2: Update Tab type and TABS array**

Change line 28:
```typescript
type Tab = "general" | "members" | "settings" | "credentials" | "integrations" | "imports" | "agents";
```

Change lines 30-37 — add `agents` to the TABS array:
```typescript
const TABS: { key: Tab; label: string }[] = [
  { key: "general", label: "General" },
  { key: "members", label: "Members" },
  { key: "settings", label: "Settings" },
  { key: "credentials", label: "Credentials" },
  { key: "integrations", label: "Integrations" },
  { key: "imports", label: "Imports" },
  { key: "agents", label: "Agents" },
];
```

**Step 3: Add the AGENT_STATUS_STYLES constant**

After the IMPORT_STATUS_COLORS constant (after line 91):

```typescript
const AGENT_STATUS_STYLES: Record<ToonyAgentStatus, { dot: string; badge: string }> = {
  ONLINE: { dot: "bg-emerald-400", badge: "bg-emerald-500/15 text-emerald-400" },
  BUSY: { dot: "bg-blue-400", badge: "bg-blue-500/15 text-blue-400" },
  OFFLINE: { dot: "bg-slate-600", badge: "bg-slate-700 text-slate-400" },
};
```

**Step 4: Create the AgentsTab component**

Insert before the `// ── Main Page ──` comment (before line 1007):

```tsx
// ────────────────────────────── Agents Tab ──────────────────────────────

function AgentsTab({ orgId }: { orgId: string }) {
  const [agents, setAgents] = useState<ToonyAgentList[]>([]);
  const [allAgents, setAllAgents] = useState<ToonyAgentList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [removeAgent, setRemoveAgent] = useState<{ id: string; name: string } | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await listToonyAgentsByOrganization(orgId);
      setAgents(res.results);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  const fetchAllAgents = useCallback(async () => {
    try {
      const res = await listToonyAgents();
      setAllAgents(res.results);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    fetchAllAgents();
  }, [fetchAgents, fetchAllAgents]);

  const availableAgents = useMemo(() => {
    const assignedIds = new Set(agents.map((a) => a.id));
    return allAgents.filter((a) => !assignedIds.has(a.id));
  }, [allAgents, agents]);

  async function handleAddAgent() {
    if (!selectedAgentId) return;
    setAddLoading(true);
    try {
      // We need the agent's current organizations to build the new list
      const agentDetail = await (await import("@/lib/api/toony-agents")).getToonyAgent(selectedAgentId) as ToonyAgentDetail;
      const newOrgIds = [...agentDetail.organizations.map((o) => o.id), orgId];
      await updateToonyAgent(selectedAgentId, { organization_ids: newOrgIds });
      await fetchAgents();
      setShowAddModal(false);
      setSelectedAgentId("");
    } catch {
      // silent
    } finally {
      setAddLoading(false);
    }
  }

  async function handleRemoveAgent() {
    if (!removeAgent) return;
    setRemoveLoading(true);
    try {
      const agentDetail = await (await import("@/lib/api/toony-agents")).getToonyAgent(removeAgent.id) as ToonyAgentDetail;
      const newOrgIds = agentDetail.organizations
        .filter((o) => o.id !== orgId)
        .map((o) => o.id);
      await updateToonyAgent(removeAgent.id, { organization_ids: newOrgIds });
      await fetchAgents();
      setRemoveAgent(null);
    } catch {
      // silent
    } finally {
      setRemoveLoading(false);
    }
  }

  if (isLoading) return <p className="text-sm text-slate-500">Loading agents...</p>;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-400">
            Toony Agents assigned to this organization.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          + Add Agent
        </button>
      </div>

      {agents.length === 0 ? (
        <div className="mt-10 text-center">
          <p className="text-sm text-slate-500">No agents assigned to this organization.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {agents.map((agent) => {
            const ss = AGENT_STATUS_STYLES[agent.status];
            return (
              <div
                key={agent.id}
                className="flex items-center justify-between rounded-lg border border-slate-800/60 bg-slate-900 px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800/60">
                    <svg
                      className="h-4 w-4 text-slate-400"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="3" y="4" width="10" height="8" rx="2" />
                      <circle cx="6" cy="8" r="0.75" fill="currentColor" stroke="none" />
                      <circle cx="10" cy="8" r="0.75" fill="currentColor" stroke="none" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-200">{agent.name}</p>
                    <p className="mt-0.5 font-mono text-xs text-slate-600">{agent.slug}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3 ml-4">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${ss.badge}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${ss.dot}`} />
                    {agent.status.charAt(0) + agent.status.slice(1).toLowerCase()}
                  </span>
                  <button
                    onClick={() => setRemoveAgent({ id: agent.id, name: agent.name })}
                    className="rounded-md px-2.5 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Agent Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowAddModal(false); setSelectedAgentId(""); } }}
        >
          <div className="w-full max-w-sm rounded-xl border border-slate-800/60 bg-slate-900 p-6">
            <h2 className="text-base font-medium tracking-tight text-white">Add Agent</h2>
            <p className="mt-1 text-sm text-slate-500">Select a Toony Agent to assign to this organization.</p>
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="mt-4 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="">Select agent...</option>
              {availableAgents.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.slug})</option>
              ))}
            </select>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setShowAddModal(false); setSelectedAgentId(""); }}
                className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddAgent}
                disabled={!selectedAgentId || addLoading}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
              >
                {addLoading ? "Adding..." : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Confirm Modal */}
      {removeAgent && (
        <ConfirmModal
          title="Remove Agent"
          message={`Remove "${removeAgent.name}" from this organization? The agent will no longer be accessible to organization members.`}
          confirmLabel="Remove"
          confirmVariant="danger"
          isLoading={removeLoading}
          onConfirm={handleRemoveAgent}
          onCancel={() => setRemoveAgent(null)}
        />
      )}
    </div>
  );
}
```

**Step 5: Add the tab content rendering**

In the main component's tab content section (after line 1089), add:

```tsx
{activeTab === "agents" && <AgentsTab orgId={orgId} />}
```

**Step 6: Add `useMemo` to the imports**

Ensure `useMemo` is in the React import (line 3). It currently imports `FormEvent, useCallback, useEffect, useState` — add `useMemo`:

```typescript
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
```

**Step 7: Verify the frontend builds**

Run: `docker compose exec frontend ./node_modules/.bin/next build`
Expected: Build succeeds without errors

**Step 8: Commit**

```bash
git add frontend/app/\(dashboard\)/organizations/\[id\]/page.tsx
git commit -m "feat(frontend): add agents tab to organization detail page"
```

---

### Task 5: Verify end-to-end and final commit

**Step 1: Run backend tests**

Run: `docker compose exec backend pytest tests/test_toony_agents.py -v`
Expected: All tests PASS

**Step 2: Run frontend build**

Run: `docker compose exec frontend ./node_modules/.bin/next build`
Expected: Build succeeds

**Step 3: Run frontend lint**

Run: `docker compose exec frontend ./node_modules/.bin/next lint`
Expected: No errors

**Step 4: Manual verification checklist**

- [ ] Toony Agent detail page shows "Organizations" section below stats
- [ ] "Add Organization" button opens modal with org dropdown
- [ ] Adding an org refreshes the list and shows the new org
- [ ] "Remove" button on an org row opens confirmation modal
- [ ] Confirming removal refreshes the list without that org
- [ ] Organization detail page has "Agents" tab (7th tab)
- [ ] "Agents" tab shows list of agents with status badges
- [ ] "Add Agent" button opens modal with agent dropdown
- [ ] "Remove" button opens confirmation modal
- [ ] Both directions stay in sync (add from one side visible on the other)
