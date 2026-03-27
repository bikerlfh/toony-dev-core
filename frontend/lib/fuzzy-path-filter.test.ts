import { describe, it, expect } from "vitest";
import { fuzzyPathMatch, filterFileTree } from "./fuzzy-path-filter";

const SAMPLE_TREE = [
  "frontend/app/(auth)/login/page.tsx",
  "frontend/app/(dashboard)/artifacts/page.tsx",
  "frontend/app/(dashboard)/projects/page.tsx",
  "frontend/app/(dashboard)/projects/[id]/page.tsx",
  "frontend/app/(dashboard)/projects/[id]/issues/[issueId]/page.tsx",
  "frontend/app/(dashboard)/tasks/page.tsx",
  "frontend/components/ui/file-autocomplete.tsx",
  "frontend/components/ui/select.tsx",
  "frontend/components/issues/create-issue-modal.tsx",
  "frontend/lib/api.ts",
  "frontend/lib/auth.ts",
  "backend/apps/projects/models/issue.py",
  "backend/apps/projects/views/issue_views.py",
  "backend/apps/projects/selectors/issue_selector.py",
  "backend/tests/test_issues.py",
  "README.md",
];

describe("fuzzyPathMatch", () => {
  it("matches simple substring", () => {
    expect(fuzzyPathMatch("frontend/lib/api.ts", "api")).toBe(true);
  });

  it("matches exact path", () => {
    expect(fuzzyPathMatch("frontend/lib/api.ts", "frontend/lib/api.ts")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(fuzzyPathMatch("frontend/lib/API.ts", "api")).toBe(true);
  });

  it("matches fuzzy segments: frontend/artifacts", () => {
    expect(
      fuzzyPathMatch("frontend/app/(dashboard)/artifacts/page.tsx", "frontend/artifacts"),
    ).toBe(true);
  });

  it("matches fuzzy segments: frontend/projects/issues", () => {
    expect(
      fuzzyPathMatch(
        "frontend/app/(dashboard)/projects/[id]/issues/[issueId]/page.tsx",
        "frontend/projects/issues",
      ),
    ).toBe(true);
  });

  it("matches fuzzy segments: backend/projects/issue", () => {
    expect(
      fuzzyPathMatch("backend/apps/projects/models/issue.py", "backend/projects/issue"),
    ).toBe(true);
  });

  it("matches partial segment names", () => {
    expect(
      fuzzyPathMatch("frontend/components/ui/file-autocomplete.tsx", "comp/file"),
    ).toBe(true);
  });

  it("does NOT match out-of-order segments", () => {
    expect(
      fuzzyPathMatch("frontend/app/(dashboard)/artifacts/page.tsx", "artifacts/frontend"),
    ).toBe(false);
  });

  it("does NOT match missing segments", () => {
    expect(
      fuzzyPathMatch("frontend/lib/api.ts", "backend/api"),
    ).toBe(false);
  });

  it("handles trailing slash in query", () => {
    expect(
      fuzzyPathMatch("frontend/app/(dashboard)/artifacts/page.tsx", "frontend/"),
    ).toBe(true);
  });

  it("handles single segment without slash (falls back to substring)", () => {
    expect(fuzzyPathMatch("frontend/lib/api.ts", "xyz")).toBe(false);
  });
});

describe("filterFileTree", () => {
  it("filters with simple query", () => {
    const results = filterFileTree(SAMPLE_TREE, "api");
    expect(results).toEqual(["frontend/lib/api.ts"]);
  });

  it("filters with fuzzy path: frontend/artifacts", () => {
    const results = filterFileTree(SAMPLE_TREE, "frontend/artifacts");
    expect(results).toEqual(["frontend/app/(dashboard)/artifacts/page.tsx"]);
  });

  it("filters with fuzzy path: frontend/issues", () => {
    const results = filterFileTree(SAMPLE_TREE, "frontend/issues");
    expect(results).toContain("frontend/app/(dashboard)/projects/[id]/issues/[issueId]/page.tsx");
    expect(results).toContain("frontend/components/issues/create-issue-modal.tsx");
  });

  it("filters with fuzzy path: backend/issue", () => {
    const results = filterFileTree(SAMPLE_TREE, "backend/issue");
    expect(results.length).toBe(4);
    expect(results).toContain("backend/apps/projects/models/issue.py");
    expect(results).toContain("backend/apps/projects/views/issue_views.py");
    expect(results).toContain("backend/apps/projects/selectors/issue_selector.py");
    expect(results).toContain("backend/tests/test_issues.py");
  });

  it("respects limit", () => {
    const results = filterFileTree(SAMPLE_TREE, "frontend", 3);
    expect(results.length).toBe(3);
  });

  it("returns empty for no matches", () => {
    const results = filterFileTree(SAMPLE_TREE, "nonexistent/path");
    expect(results).toEqual([]);
  });
});
