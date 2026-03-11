# Workflow Model Changes: Remove Issue FK, Labels M2M

## Summary

Three interconnected changes to the Workflow system:
1. Remove the `issue` ForeignKey from the Workflow model
2. Change `label` (FK singular) to `labels` (ManyToMany)
3. Update resolve logic to rank by label match count
4. Frontend: add editable Organization/Project fields, multi-select labels

## Backend

### Model Changes
- Remove `issue` FK and related constraint
- Replace `label` FK with `labels` M2M to `workspace.Label`
- Update `unique_global_workflow_slug` constraint to remove `issue__isnull` condition

### Resolve Selector
- Remove issue scope from resolution
- New logic: per scope (project → org → global), find workflows whose labels intersect with issue labels, order by match count (descending)
- Fallback: workflows with no labels, same scope precedence
- Uses `annotate(Count("labels", filter=Q(labels__id__in=...)))` for ranking

### Serializers
- Remove `issue` from create input and all output serializers
- Change `label` (UUID) → `labels` (list of UUIDs) in input/output

### Service
- `create_workflow`: remove `issue`, use `workflow.labels.set()` for M2M
- `update_workflow`: add `labels` handling with `.set()`

## Frontend

### Workflow Edit Page
- Add editable Organization select (fetches user's orgs)
- Add conditional Project select (fetches org's projects when org selected)
- Replace single label Select with multi-select chips component
- Remove "Issue" from scope display
- New state: `wfLabelIds`, `wfOrgId`, `wfProjectId`, `organizations`, `orgProjects`

### Types & API Client
- Remove `issue` from workflow types
- Change `label?: string` → `labels: string[]`
- Update `updateWorkflow` payload to accept `organization`, `project`, `labels`
