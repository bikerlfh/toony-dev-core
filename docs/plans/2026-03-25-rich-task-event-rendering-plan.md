# Rich Task Event Rendering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the task event UI with Shiki syntax highlighting, tool-specific rendering for all tools, and TOOL_USE ↔ TOOL_RESULT correlation via tool_use_id.

**Architecture:** New `CodeBlock` component wraps Shiki for syntax-highlighted code. `TaskLiveOutput` builds a result lookup map and passes matched results to `TaskEventItem`. `TaskEventItem` renders each tool type with specialized UI (diffs, bash output, file content, JSON pretty-print).

**Tech Stack:** Next.js 15, React 19, Shiki (syntax highlighting), Tailwind CSS v4

---

### Task 1: Install Shiki

**Files:**
- Modify: `frontend/package.json`

**Step 1: Install shiki**

The frontend runs inside Docker. Install via the container:

```bash
docker compose exec frontend npm install shiki
```

If Docker is not running, install locally:

```bash
cd frontend && npm install shiki
```

**Step 2: Verify installation**

```bash
grep shiki frontend/package.json
```

Expected: `"shiki": "^X.Y.Z"` in dependencies.

**Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore(frontend): add shiki for syntax highlighting"
```

---

### Task 2: Create CodeBlock component

**Files:**
- Create: `frontend/components/toony-agents/code-block.tsx`

**Step 1: Create the component**

Create `frontend/components/toony-agents/code-block.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

const EXT_TO_LANG: Record<string, string> = {
  ".py": "python", ".js": "javascript", ".ts": "typescript",
  ".tsx": "tsx", ".jsx": "jsx", ".rs": "rust", ".go": "go",
  ".rb": "ruby", ".java": "java", ".kt": "kotlin", ".c": "c",
  ".cpp": "cpp", ".h": "c", ".cs": "csharp", ".swift": "swift",
  ".sh": "bash", ".bash": "bash", ".zsh": "bash",
  ".json": "json", ".yaml": "yaml", ".yml": "yaml",
  ".toml": "toml", ".md": "markdown", ".html": "html",
  ".css": "css", ".scss": "scss", ".sql": "sql", ".xml": "xml",
  ".dockerfile": "dockerfile", ".graphql": "graphql",
  ".vue": "vue", ".svelte": "svelte", ".php": "php",
};

function detectLanguage(fileName?: string): string | undefined {
  if (!fileName) return undefined;
  const dot = fileName.lastIndexOf(".");
  if (dot === -1) return undefined;
  return EXT_TO_LANG[fileName.slice(dot).toLowerCase()];
}

interface CodeBlockProps {
  code: string;
  language?: string;
  fileName?: string;
  maxHeight?: number;
}

export function CodeBlock({
  code,
  language,
  fileName,
  maxHeight = 320,
}: CodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null);
  const lang = language ?? detectLanguage(fileName) ?? "text";

  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      try {
        const { codeToHtml } = await import("shiki");
        const result = await codeToHtml(code, {
          lang,
          theme: "github-dark-default",
        });
        if (!cancelled) setHtml(result);
      } catch {
        // Fallback: unsupported language or shiki load failure
        if (!cancelled) setHtml("");
      }
    }

    highlight();
    return () => { cancelled = true; };
  }, [code, lang]);

  // Show plain text while shiki loads or on failure
  if (html === null || html === "") {
    return (
      <pre
        className="overflow-auto text-xs font-mono text-slate-400 whitespace-pre-wrap p-3"
        style={{ maxHeight }}
      >
        {code}
      </pre>
    );
  }

  return (
    <div
      className="overflow-auto text-xs [&_pre]:!p-3 [&_pre]:!m-0 [&_pre]:!bg-transparent [&_code]:!text-xs"
      style={{ maxHeight }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

**Step 2: Verify it renders**

No test framework available in frontend. Manual verification:
- Import `CodeBlock` temporarily in a page
- Or just verify it compiles: `cd frontend && npx next build 2>&1 | tail -5` (if build is feasible) or just proceed to Task 3.

**Step 3: Commit**

```bash
git add frontend/components/toony-agents/code-block.tsx
git commit -m "feat(frontend): add CodeBlock component with Shiki syntax highlighting"
```

---

### Task 3: Add TOOL_USE ↔ TOOL_RESULT correlation in TaskLiveOutput

**Files:**
- Modify: `frontend/components/toony-agents/task-live-output.tsx`
- Modify: `frontend/components/toony-agents/task-event-item.tsx` (props only)

**Step 1: Build result lookup map in TaskLiveOutput**

In `task-live-output.tsx`, before the return statement, build a map of `tool_use_id → TOOL_RESULT event data`:

Replace the events mapping block (lines 63-79) with:

```tsx
          {events.length === 0 ? (
          <p className="text-sm text-slate-500 italic">
            Waiting for events...
          </p>
        ) : (
          (() => {
            // Build tool_use_id → TOOL_RESULT data map
            const toolResultMap = new Map<string, Record<string, unknown>>();
            const toolResultEventIds = new Set<string>();
            for (const ev of events) {
              if (ev.event_type === "TOOL_RESULT" && ev.data.tool_use_id) {
                toolResultMap.set(String(ev.data.tool_use_id), ev.data);
                toolResultEventIds.add(ev.id);
              }
            }

            return events
              .filter((ev) => !toolResultEventIds.has(ev.id))
              .map((event) => {
                const toolResult =
                  event.event_type === "TOOL_USE" && event.data.tool_use_id
                    ? toolResultMap.get(String(event.data.tool_use_id))
                    : undefined;

                return (
                  <TaskEventItem
                    key={event.id}
                    event={event}
                    toolResult={toolResult}
                    onAnswer={
                      event.event_type === "QUESTION_ASKED"
                        ? onAnswer
                        : undefined
                    }
                    isAnswered={
                      event.event_type === "QUESTION_ASKED"
                        ? answeredSequences.has(event.sequence)
                        : undefined
                    }
                    disabled={!agentConnected}
                  />
                );
              });
          })()
        )}
```

**Step 2: Add `toolResult` prop to TaskEventItem**

In `task-event-item.tsx`, update the interface (line 9-15):

```tsx
interface TaskEventItemProps {
  event: TaskEventItemType;
  toolResult?: Record<string, unknown>;
  onAnswer?: (questionId: string, answer: string) => void;
  onMessage?: (text: string) => void;
  isAnswered?: boolean;
  disabled?: boolean;
}
```

And add it to the destructured props (line 17-22):

```tsx
export function TaskEventItem({
  event,
  toolResult,
  onAnswer,
  isAnswered,
  disabled,
}: TaskEventItemProps) {
```

**Step 3: Commit**

```bash
git add frontend/components/toony-agents/task-live-output.tsx frontend/components/toony-agents/task-event-item.tsx
git commit -m "feat(frontend): add TOOL_USE to TOOL_RESULT correlation via tool_use_id"
```

---

### Task 4: Refactor TaskEventItem for rich tool rendering

**Files:**
- Modify: `frontend/components/toony-agents/task-event-item.tsx`

This is the main task. Replace the entire `TOOL_USE` and `TOOL_RESULT` cases with rich rendering.

**Step 1: Add CodeBlock import**

At the top of `task-event-item.tsx`, add:

```tsx
import { CodeBlock } from "@/components/toony-agents/code-block";
```

**Step 2: Replace the TOOL_USE case (lines 47-111)**

Replace with:

```tsx
    case "TOOL_USE": {
      const toolName = String(event.data.tool_name ?? "");
      const input = (event.data.input ?? {}) as Record<string, unknown>;
      const resultContent = toolResult
        ? String(toolResult.content ?? toolResult.result ?? toolResult.output ?? "")
        : "";
      const resultIsError = Boolean(toolResult?.is_error);

      // Summary line for the header
      const toolDetail =
        input.description ? String(input.description) :
        input.file_path ? String(input.file_path) :
        input.pattern ? String(input.pattern) :
        input.command ? String(input.command) :
        input.query ? String(input.query) :
        input.url ? String(input.url) :
        input.prompt ? String(input.prompt).slice(0, 80) :
        input.skill ? String(input.skill) :
        "";

      const isExpandable =
        (toolName === "Edit" && input.old_string && input.new_string) ||
        (toolName === "Write" && input.content) ||
        (toolName === "Bash" && input.command) ||
        (toolName === "Read" && input.file_path) ||
        (toolName === "Grep" && input.pattern) ||
        (toolName === "Glob" && input.pattern) ||
        (toolName === "WebFetch" || toolName === "WebSearch") ||
        Boolean(resultContent);

      return (
        <div className="py-0.5">
          {/* Header */}
          <span
            className={`text-indigo-400 font-mono text-sm${isExpandable ? " cursor-pointer hover:text-indigo-300 transition-colors" : ""}`}
            onClick={isExpandable ? () => setShowToolDetail((v) => !v) : undefined}
          >
            {isExpandable ? (showToolDetail ? "▾ " : "▸ ") : "▸ "}
            {toolName}
            {toolDetail ? `: ${toolDetail}` : ""}
            {toolResult && (
              <span className={`ml-2 text-xs ${resultIsError ? "text-red-400" : "text-emerald-400"}`}>
                {resultIsError ? "✗" : "✓"}
              </span>
            )}
          </span>

          {showToolDetail && (
            <div className="mt-1 ml-4">
              {/* Edit: diff view */}
              {toolName === "Edit" && Boolean(input.old_string) && Boolean(input.new_string) && (
                <div className="rounded border border-slate-800 bg-slate-950 overflow-auto max-h-80 text-xs font-mono">
                  <div className="border-b border-slate-800 px-3 py-1.5 text-slate-500">
                    {String(input.file_path ?? "")}
                  </div>
                  <div className="border-b border-slate-800/50">
                    <pre className="px-3 py-2 whitespace-pre-wrap bg-red-500/5 text-red-400/80">
                      {String(input.old_string).split("\n").map((line, i) => (
                        <span key={i}>{`- ${line}\n`}</span>
                      ))}
                    </pre>
                  </div>
                  <div>
                    <pre className="px-3 py-2 whitespace-pre-wrap bg-emerald-500/5 text-emerald-400/80">
                      {String(input.new_string).split("\n").map((line, i) => (
                        <span key={i}>{`+ ${line}\n`}</span>
                      ))}
                    </pre>
                  </div>
                </div>
              )}

              {/* Write: file content with syntax highlighting */}
              {toolName === "Write" && Boolean(input.content) && (
                <div className="rounded border border-slate-800 bg-slate-950 overflow-hidden">
                  <div className="border-b border-slate-800 px-3 py-1.5 text-slate-500 text-xs font-mono">
                    {String(input.file_path ?? "")}
                  </div>
                  <CodeBlock
                    code={String(input.content)}
                    fileName={String(input.file_path ?? "")}
                  />
                </div>
              )}

              {/* Bash: command + result */}
              {toolName === "Bash" && Boolean(input.command) && (
                <div className="rounded border border-slate-800 bg-slate-950 overflow-hidden">
                  <pre className="px-3 py-2 text-xs font-mono text-amber-400/80 whitespace-pre-wrap border-b border-slate-800">
                    $ {String(input.command)}
                  </pre>
                  {resultContent && (
                    <pre className={`px-3 py-2 overflow-auto max-h-60 text-xs font-mono whitespace-pre-wrap ${resultIsError ? "text-red-400/80" : "text-slate-400"}`}>
                      {resultContent}
                    </pre>
                  )}
                </div>
              )}

              {/* Read: file path + content from result */}
              {toolName === "Read" && Boolean(input.file_path) && resultContent && (
                <div className="rounded border border-slate-800 bg-slate-950 overflow-hidden">
                  <div className="border-b border-slate-800 px-3 py-1.5 text-slate-500 text-xs font-mono">
                    {String(input.file_path)}
                  </div>
                  <CodeBlock
                    code={resultContent}
                    fileName={String(input.file_path)}
                  />
                </div>
              )}

              {/* Grep: pattern + results */}
              {toolName === "Grep" && resultContent && (
                <pre className="rounded border border-slate-800 bg-slate-950 px-3 py-2 overflow-auto max-h-60 text-xs font-mono text-slate-400 whitespace-pre-wrap">
                  {resultContent}
                </pre>
              )}

              {/* Glob: file list */}
              {toolName === "Glob" && resultContent && (
                <pre className="rounded border border-slate-800 bg-slate-950 px-3 py-2 overflow-auto max-h-60 text-xs font-mono text-slate-400 whitespace-pre-wrap">
                  {resultContent}
                </pre>
              )}

              {/* WebFetch / WebSearch */}
              {(toolName === "WebFetch" || toolName === "WebSearch") && resultContent && (
                <pre className="rounded border border-slate-800 bg-slate-950 px-3 py-2 overflow-auto max-h-60 text-xs font-mono text-slate-400 whitespace-pre-wrap">
                  {resultContent}
                </pre>
              )}

              {/* Generic fallback: tools not handled above */}
              {!["Edit", "Write", "Bash", "Read", "Grep", "Glob", "WebFetch", "WebSearch"].includes(toolName) && (
                <>
                  {Object.keys(input).length > 0 && (
                    <pre className="rounded border border-slate-800 bg-slate-950 px-3 py-2 overflow-auto max-h-40 text-xs font-mono text-slate-400 whitespace-pre-wrap">
                      {JSON.stringify(input, null, 2)}
                    </pre>
                  )}
                  {resultContent && (
                    <pre className="mt-1 rounded border border-slate-800 bg-slate-950 px-3 py-2 overflow-auto max-h-60 text-xs font-mono text-slate-400 whitespace-pre-wrap">
                      {resultContent}
                    </pre>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      );
    }
```

**Step 3: Replace the TOOL_RESULT case (lines 114-131)**

This now only renders orphan results (no matching TOOL_USE). Keep it as a fallback:

```tsx
    case "TOOL_RESULT": {
      // Orphan result (no matching TOOL_USE) — rendered standalone
      const resultText = String(event.data.content ?? event.data.result ?? event.data.output ?? "");
      const isError = Boolean(event.data.is_error);
      return (
        <div className="py-0.5">
          <button
            onClick={() => setShowToolResult((v) => !v)}
            className={`font-mono text-sm hover:text-slate-300 transition-colors ${isError ? "text-red-400" : "text-slate-500"}`}
          >
            {showToolResult ? "▾ Hide result" : "▸ Show result"}
            {isError && " (error)"}
          </button>
          {showToolResult && (
            <pre className={`mt-1 ml-4 max-h-60 overflow-auto rounded border border-slate-800 bg-slate-950 p-2 text-xs font-mono whitespace-pre-wrap ${isError ? "text-red-400/80" : "text-slate-400"}`}>
              {resultText}
            </pre>
          )}
        </div>
      );
    }
```

**Step 4: Verify build compiles**

```bash
docker compose exec frontend npx next build 2>&1 | tail -10
```

Or locally:

```bash
cd frontend && npx next build 2>&1 | tail -10
```

Expected: Build succeeds without type errors.

**Step 5: Commit**

```bash
git add frontend/components/toony-agents/task-event-item.tsx
git commit -m "feat(frontend): rich tool rendering with syntax highlighting and inline results"
```

---

### Task 5: Push and verify

**Step 1: Push to PR branch**

```bash
git push origin worktree-persistent-claude-sessions
```

**Step 2: Manual verification**

Start the dev environment and trigger a task that uses Edit, Bash, Read, Write, and Grep tools. Verify:

- [ ] Edit shows diff with `-`/`+` colored lines
- [ ] Write shows file content with syntax highlighting
- [ ] Bash shows `$ command` + output below
- [ ] Read shows file path + syntax-highlighted content
- [ ] Grep/Glob show results in monospace
- [ ] Generic tools (MCP, etc.) show JSON pretty-print of input
- [ ] TOOL_RESULT renders inline under its TOOL_USE (not as separate event)
- [ ] Success/error indicators (✓/✗) appear on tool headers
- [ ] Collapsible sections work (click to expand/collapse)
