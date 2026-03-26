# Rich Task Event Rendering

## Problem

The runner now sends full tool data (complete input, tool_use_id, tool results), but the frontend only renders a subset: tool name + one summary field for TOOL_USE, and plain preformatted text for TOOL_RESULT. There's no correlation between a tool invocation and its result, no syntax highlighting, and tools without specific rendering show nothing useful.

## Solution

Upgrade `task-event-item.tsx` with tool-specific rendering, Shiki syntax highlighting, and TOOL_USE ↔ TOOL_RESULT correlation via `tool_use_id`.

## Dependencies

- **`shiki`** — Syntax highlighting engine (same as VS Code). Supports 200+ languages, dark themes, works client-side.

## Tool-Specific Rendering

### Edit

Current: diff with `-`/`+` colored lines.
New: Same diff layout + syntax highlighting based on file extension.

```
▾ Edit: src/main.py
┌─────────────────────────────┐
│ src/main.py                 │
├─────────────────────────────┤
│ - def hello():              │  (red bg, highlighted)
│ + def greet(name):          │  (green bg, highlighted)
│ - ····print('hi')           │
│ + ····print(f'hi {name}')   │
└─────────────────────────────┘
```

### Write

Current: path + plain content.
New: path + syntax-highlighted content.

### Bash

Current: `$ command` in amber.
New: `$ command` + TOOL_RESULT output below (linked via tool_use_id), with exit code indicator.

```
▾ Bash: npm test
┌──────────────────────────────┐
│ $ npm test                   │  (amber)
├──────────────────────────────┤
│ PASS src/test.ts             │  (monospace, scrollable)
│ ✓ should work (3ms)          │
└──────────────────────────────┘
```

### Read

Current: just `file_path`.
New: `file_path` + file content from TOOL_RESULT with syntax highlighting.

### Grep

Current: just `pattern`.
New: `pattern` + path + matching lines from TOOL_RESULT.

### Glob

Current: just `pattern`.
New: `pattern` + file list from TOOL_RESULT.

### WebFetch / WebSearch

Current: just `url` / `query`.
New: URL/query + result content, collapsible.

### All other tools (MCP tools, Agent, Skill, etc.)

Current: just tool name.
New: tool name + collapsible JSON pretty-print of full input + TOOL_RESULT if available.

## TOOL_USE ↔ TOOL_RESULT Correlation

The runner now sends `tool_use_id` in both TOOL_USE and TOOL_RESULT events. The frontend uses this to display results inline under their corresponding tool invocation.

**Approach:** `task-event-item.tsx` receives an optional `toolResult` prop. The parent component (`task-live-output.tsx` or the task detail page) matches TOOL_RESULT events to TOOL_USE events by `tool_use_id` and passes them down.

```tsx
<TaskEventItem
  event={toolUseEvent}
  toolResult={matchedToolResult}  // linked by tool_use_id
/>
```

When a TOOL_RESULT has a matching TOOL_USE, it renders inline (not as a separate event). Orphan TOOL_RESULT events (no matching TOOL_USE) render standalone with the current "Show result" toggle.

## CodeBlock Component

New reusable component: `components/toony-agents/code-block.tsx`

```tsx
interface CodeBlockProps {
  code: string;
  language?: string;
  fileName?: string;   // used to detect language from extension
  maxHeight?: number;   // px, default 320
}
```

- Detects language from `fileName` extension (`.py` → python, `.tsx` → tsx, `.rs` → rust, etc.)
- Falls back to `language` prop, then plain text
- Uses Shiki `codeToHtml()` with a dark theme compatible with the slate UI
- Max height with overflow scroll
- Lazy-loads Shiki highlighter (heavy library, ~2MB)

### Language detection map

```typescript
const EXT_TO_LANG: Record<string, string> = {
  ".py": "python", ".js": "javascript", ".ts": "typescript",
  ".tsx": "tsx", ".jsx": "jsx", ".rs": "rust", ".go": "go",
  ".rb": "ruby", ".java": "java", ".kt": "kotlin",
  ".sh": "bash", ".bash": "bash", ".zsh": "bash",
  ".json": "json", ".yaml": "yaml", ".yml": "yaml",
  ".toml": "toml", ".md": "markdown", ".html": "html",
  ".css": "css", ".sql": "sql", ".xml": "xml",
  ".dockerfile": "dockerfile", ".graphql": "graphql",
};
```

## File Changes

| File | Change |
|------|--------|
| `frontend/package.json` | Add `shiki` dependency |
| `frontend/components/toony-agents/code-block.tsx` | **New**: CodeBlock component with Shiki |
| `frontend/components/toony-agents/task-event-item.tsx` | Refactor: tool-specific rendering, integrate TOOL_RESULT, use CodeBlock |
| `frontend/components/toony-agents/task-live-output.tsx` | Pass matched TOOL_RESULT to TaskEventItem via toolResult prop |

## No Backend/Runner Changes

All rendering is frontend-only. The data already arrives complete from the runner.
