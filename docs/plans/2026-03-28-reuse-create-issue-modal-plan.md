# Reuse Create Issue Modal — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the old `CreateIssueModal` with a refactored `QuickCreateIssueModal` that works in both the projects page (fixed project) and tasks page (project selector).

**Architecture:** Add an optional `projectId` prop to `QuickCreateIssueModal`. When provided, auto-fetch project data on mount and hide the project pill. Move the component and `PillDropdown` from `components/tasks/` to `components/issues/` since they're now shared. Delete the old `CreateIssueModal`.

**Tech Stack:** React 19, Next.js 15, TypeScript, Tailwind CSS v4

---

### Task 1: Move PillDropdown to components/issues/

**Files:**
- Move: `frontend/components/tasks/pill-dropdown.tsx` → `frontend/components/issues/pill-dropdown.tsx`

**Step 1: Move the file**

```bash
mv frontend/components/tasks/pill-dropdown.tsx frontend/components/issues/pill-dropdown.tsx
```

**Step 2: Commit**

```bash
git add frontend/components/tasks/pill-dropdown.tsx frontend/components/issues/pill-dropdown.tsx
git commit -m "refactor(frontend): move PillDropdown to components/issues/"
```

---

### Task 2: Move and refactor QuickCreateIssueModal

**Files:**
- Move: `frontend/components/tasks/quick-create-issue-modal.tsx` → `frontend/components/issues/quick-create-issue-modal.tsx`
- Modify: the moved file (add optional `projectId` prop, conditional logic)

**Step 1: Move the file**

```bash
mv frontend/components/tasks/quick-create-issue-modal.tsx frontend/components/issues/quick-create-issue-modal.tsx
```

**Step 2: Update PillDropdown import path**

In `frontend/components/issues/quick-create-issue-modal.tsx`, change the relative import:

```typescript
// Before
import { PillDropdown } from "./pill-dropdown";

// After — same directory now, no change needed since both are in components/issues/
import { PillDropdown } from "./pill-dropdown";
```

No change needed — the import is already `"./pill-dropdown"` and both files are now in the same directory.

**Step 3: Refactor props interface**

Replace the props interface:

```typescript
// Before
interface QuickCreateIssueModalProps {
  projects: ProjectList[];
  onClose: () => void;
  onCreated: () => void;
}

// After
interface QuickCreateIssueModalProps {
  projects?: ProjectList[];
  projectId?: string;
  onClose: () => void;
  onCreated: () => void;
}
```

**Step 4: Update the component destructuring**

```typescript
// Before
export function QuickCreateIssueModal({
  projects,
  onClose,
  onCreated,
}: QuickCreateIssueModalProps) {

// After
export function QuickCreateIssueModal({
  projects,
  projectId: fixedProjectId,
  onClose,
  onCreated,
}: QuickCreateIssueModalProps) {
```

**Step 5: Initialize projectId state from prop**

```typescript
// Before
const [projectId, setProjectId] = useState<string | null>(null);

// After
const [projectId, setProjectId] = useState<string | null>(fixedProjectId ?? null);
```

**Step 6: Add useEffect to auto-fetch when fixedProjectId is provided**

Add this right after the existing `fetchProjectData` callback (after line 107 in original):

```typescript
// --- Auto-fetch when projectId is fixed (projects page context) ---
useEffect(() => {
  if (fixedProjectId) {
    fetchProjectData(fixedProjectId);
  }
}, [fixedProjectId, fetchProjectData]);
```

**Step 7: Update dirty check to exclude projectId when fixed**

```typescript
// Before
const hasFormData =
  title.trim() !== "" ||
  description.trim() !== "" ||
  projectId !== null ||
  priority !== null ||
  assigneeId !== null ||
  labelIds.length > 0 ||
  milestoneId !== null ||
  cycleId !== null ||
  dueDate !== "";

// After
const hasFormData =
  title.trim() !== "" ||
  description.trim() !== "" ||
  (!fixedProjectId && projectId !== null) ||
  priority !== null ||
  assigneeId !== null ||
  labelIds.length > 0 ||
  milestoneId !== null ||
  cycleId !== null ||
  dueDate !== "";
```

**Step 8: Remove selectedProject lookup when fixed (update header)**

In the header section, replace the project display logic:

```tsx
// Before
{selectedProject ? (
  <span className="flex items-center gap-1.5 rounded-md bg-slate-800 px-2 py-1 text-xs font-medium text-slate-300">
    {selectedProject.icon && (
      <span className="text-xs leading-none">{selectedProject.icon}</span>
    )}
    {selectedProject.name}
  </span>
) : (
  <span className="text-xs text-slate-500">Select project</span>
)}

// After
{!fixedProjectId && (
  selectedProject ? (
    <span className="flex items-center gap-1.5 rounded-md bg-slate-800 px-2 py-1 text-xs font-medium text-slate-300">
      {selectedProject.icon && (
        <span className="text-xs leading-none">{selectedProject.icon}</span>
      )}
      {selectedProject.name}
    </span>
  ) : (
    <span className="text-xs text-slate-500">Select project</span>
  )
)}
```

**Step 9: Conditionally render Project pill in the pill bar**

Wrap the Project PillDropdown in a condition:

```tsx
// Before
{/* Project */}
<PillDropdown
  label="Project"
  options={projects.map((p) => ({
    value: p.id,
    label: p.name,
    icon: p.icon ? <span>{p.icon}</span> : undefined,
  }))}
  value={projectId}
  onChange={handleProjectChange}
/>

// After
{/* Project — only shown when no fixed project */}
{!fixedProjectId && projects && (
  <PillDropdown
    label="Project"
    options={projects.map((p) => ({
      value: p.id,
      label: p.name,
      icon: p.icon ? <span>{p.icon}</span> : undefined,
    }))}
    value={projectId}
    onChange={handleProjectChange}
  />
)}
```

**Step 10: Guard the selectedProject lookup**

```typescript
// Before
const selectedProject = projects.find((p) => p.id === projectId);

// After
const selectedProject = projects?.find((p) => p.id === projectId);
```

**Step 11: Commit**

```bash
git add frontend/components/tasks/quick-create-issue-modal.tsx frontend/components/issues/quick-create-issue-modal.tsx
git commit -m "refactor(frontend): move QuickCreateIssueModal to components/issues/ and add optional projectId prop"
```

---

### Task 3: Update tasks page import

**Files:**
- Modify: `frontend/app/(dashboard)/tasks/page.tsx`

**Step 1: Update the import path**

```typescript
// Before
import { QuickCreateIssueModal } from "@/components/tasks/quick-create-issue-modal";

// After
import { QuickCreateIssueModal } from "@/components/issues/quick-create-issue-modal";
```

No other changes needed — the tasks page already passes `projects` without `projectId`, which is the existing behavior.

**Step 2: Commit**

```bash
git add frontend/app/(dashboard)/tasks/page.tsx
git commit -m "refactor(frontend): update tasks page import for moved QuickCreateIssueModal"
```

---

### Task 4: Replace CreateIssueModal in projects page

**Files:**
- Modify: `frontend/app/(dashboard)/projects/[id]/page.tsx`

**Step 1: Replace the import**

```typescript
// Before
import { CreateIssueModal } from "@/components/issues/create-issue-modal";

// After
import { QuickCreateIssueModal } from "@/components/issues/quick-create-issue-modal";
```

**Step 2: Replace the modal usage**

Find the `CreateIssueModal` usage (around line 1774) and replace it:

```tsx
// Before
<CreateIssueModal
  projectId={projectId}
  members={members}
  milestones={milestones}
  cycles={cycles}
  labels={labels}
  onClose={() => setShowCreate(false)}
  onCreated={fetchIssues}
/>

// After
<QuickCreateIssueModal
  projectId={projectId}
  onClose={() => setShowCreate(false)}
  onCreated={fetchIssues}
/>
```

Note: `members`, `milestones`, `cycles`, `labels` props are no longer needed — the modal fetches its own data.

**Step 3: Commit**

```bash
git add frontend/app/(dashboard)/projects/[id]/page.tsx
git commit -m "refactor(frontend): replace CreateIssueModal with QuickCreateIssueModal in projects page"
```

---

### Task 5: Delete old CreateIssueModal

**Files:**
- Delete: `frontend/components/issues/create-issue-modal.tsx`

**Step 1: Delete the file**

```bash
rm frontend/components/issues/create-issue-modal.tsx
```

**Step 2: Commit**

```bash
git add frontend/components/issues/create-issue-modal.tsx
git commit -m "refactor(frontend): delete unused CreateIssueModal"
```

---

### Task 6: Verify build

**Step 1: Run the frontend lint**

```bash
make lint-frontend
```

Expected: PASS with no errors.

**Step 2: Run frontend build**

```bash
docker compose exec frontend ./node_modules/.bin/next build
```

Expected: Build succeeds with no type errors.

**Step 3: Manual smoke test (instructions for the developer)**

1. Open the **tasks page** (`/tasks`), click "Create Issue" — should show project selector pill, same behavior as before.
2. Open a **project page** (`/projects/<id>`), click "Create Issue" — should show the new Quick modal without a project pill, auto-loads members/milestones/cycles/labels.
3. In both modals: fill form partially, press Escape — should show discard confirmation.
4. In both modals: create an issue — should succeed and close modal.
