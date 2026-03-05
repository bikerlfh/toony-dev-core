# Toony — Interface Design System

## Direction & Feel

Command-center precision. Dense but breathable. Technical without being cold. A developer/PM tool for triaging work across organizations — every element earns its space.

## Surfaces & Depth

- **Strategy:** Borders-only. No shadows on cards or surfaces.
- **Canvas:** `slate-950` (same as sidebar)
- **Cards:** `slate-900`, border `border-slate-800/60`, rounded `rounded-xl`, padding `p-5`
- **Card hover:** `hover:border-slate-700/60` (subtle border lightening, no shadow or scale)
- **Sidebar:** Same `slate-950` as canvas, separated by `border-r border-slate-800/60`
- **Dropdowns:** `bg-slate-900`, `border-slate-800`, `shadow-xl`, entry animation `selectDropdown 150ms ease-out`
- **Dividers inside cards:** `border-t border-slate-800/40` (softer than card borders)

## Color

- **Brand accent:** `indigo-600` (buttons), `indigo-500` (hover), `indigo-400` (text highlights, active filter indicators)
- **Active filter highlight:** `border-indigo-500/30 bg-indigo-500/10 text-indigo-400`
- **Text hierarchy:**
  - Primary: `text-white`
  - Secondary: `text-slate-400`
  - Tertiary: `text-slate-500`
  - Muted: `text-slate-600`
  - Disabled: `text-slate-700`
- **Status colors:**
  - Backlog: `slate-500/600`
  - Planned: `blue-400/500`
  - Active/In Progress: `amber-400/500`
  - Paused: `orange-400/500`
  - Done/Completed: `emerald-400/500`
  - Canceled: `red-400/500`
- **Priority colors:**
  - Urgent: `red-500`
  - High: `orange-500`
  - Medium: `amber-500`
  - Low: `blue-500`

## Typography

- System default (no custom font loaded)
- Page headings: `text-2xl font-medium tracking-tight text-white`
- Card titles: `text-[15px] font-semibold leading-tight text-white`
- Card metadata: `text-xs`
- Filter labels: `text-[10px] font-medium uppercase tracking-wider text-slate-600`
- Filter pills: `text-xs font-medium`

## Spacing

- Tailwind 4px base
- Page padding: `p-6` (from dashboard layout)
- Header to filters: `mt-5`
- Filters to count: `mt-4`
- Count to grid: `mt-4`
- Card grid gap: `gap-4`
- Card grid columns: `sm:grid-cols-2 lg:grid-cols-3`

## Signature Elements

### Status left-border
Cards have a 3px colored left border indicating status. Provides instant visual scanning across a grid — you see project health before reading any text. Implementation: `border-l-[3px]` combined with status-specific `border-l-{color}` classes.

### Priority signal bars
Small bar-chart indicator (4 bars, like signal strength) replacing text badges. Bars are 3px wide with 2px gap, heights scale from 6px to 12px. Active bars use priority color, inactive bars use `bg-slate-800`. Compact, visual, distinctive.

### Project icon container
Uses project's `icon` (emoji) and `color` (hex) fields. Container: `h-9 w-9 rounded-lg`. Background: project color at 10% opacity (`${color}18`). Falls back to first letter of project name on `bg-slate-800/60`.

## Component Patterns

### Filter pills (inline toggles)
Single-select pill groups for enumerated values (status, priority). Active: `bg-slate-800 text-slate-200`. Inactive: `text-slate-500 hover:text-slate-300`. Optional colored dot (`h-1.5 w-1.5 rounded-full`) before label. Group label: uppercase micro text before pills.

### Custom dropdown (organization filter)
Trigger button with icon + label + chevron. Active state uses indigo accent tint. Dropdown positioned absolute below trigger, `max-h-64 overflow-y-auto`. Items: `px-3 py-2 text-xs`. Active item: `bg-slate-800/60 text-white`. Close on outside click via mousedown listener + ref.

### Loading skeletons
Pulse placeholders matching the shape of real content. Cards: full-height div with `animate-pulse rounded-xl border border-slate-800/60 bg-slate-900`. Header elements: rounded rectangles matching approximate dimensions.

### Empty states
Centered text with contextual messaging. When filters active: "No projects match these filters." + "Clear filters" link (`text-indigo-400`). When no data: "No projects yet." No icons or illustrations — text only.

### Card hover interaction
Card title transitions to `text-indigo-400` on hover via Tailwind `group` / `group-hover:` pattern. Combined with border lightening on the card container.

## Buttons

- Primary: `rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500`
- Ghost/text: `text-sm text-indigo-400 hover:text-indigo-300`
- Clear action: `text-xs text-slate-500 hover:text-slate-300` with small X icon

## Avatar circles

- Small (in cards): `h-5 w-5 rounded-full bg-slate-800 text-[10px] font-medium text-slate-400`
- Medium (standalone): `h-6 w-6 rounded-full bg-slate-700 text-xs font-medium text-slate-300`
- Content: First letter of first_name, fallback to first letter of email, uppercased
