# Toony Dev Core — Interface Design System

## Direction & Feel

Dev-tool aesthetic. Confident, precise, opinionated. Inspired by Linear and terminal UIs — not friendly consumer SaaS. The product feels like a well-built IDE, not a Trello board.

**Domain metaphors:** Terminal prompts, workspaces, initialization, shipping cadence, code editors at night.

**Signature:** Terminal-path breadcrumbs for navigation context (`~ / no workspace found`). 1px-gap bento grids for feature/data layouts. Branded logomark (indigo square in frosted container) as consistent identity mark.

## Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--canvas` | `slate-950` | Base background for all full-page screens |
| `--surface` | `slate-900` | Elevated cards, dropdowns, nav backgrounds |
| `--surface-hover` | `slate-900/60` | Interactive hover on cards/grid items |
| `--border` | `slate-800/60` | Subtle structural borders (low opacity) |
| `--border-strong` | `slate-700` | Emphasized borders (secondary buttons, inputs) |
| `--text-primary` | `white` | Headings, primary labels, active nav |
| `--text-secondary` | `slate-300` | Body text, button labels, nav items |
| `--text-tertiary` | `slate-400` | Descriptions, supporting text |
| `--text-muted` | `slate-500` | Metadata, helper text, card descriptions |
| `--text-faint` | `slate-600` | Footer, timestamps, minimal context |
| `--accent` | `indigo-600` | Primary buttons, CTAs |
| `--accent-hover` | `indigo-500` | Button hover states |
| `--accent-text` | `indigo-400` | Highlighted text, icon tints, accent spans |
| `--accent-subtle` | `indigo-500/20` | Logomark containers, frosted accent backgrounds |
| `--accent-ghost` | `indigo-500/15` | Lighter frosted containers |
| `--status-live` | `emerald-500` | Status dots, active indicators |
| `--semantic-error` | Existing red system | Errors (unchanged from current app) |

**Note:** The dashboard interior (post-login) keeps the existing light `bg-gray-50` content area + dark `bg-gray-900` sidebar. The dark palette above applies to full-page screens outside the dashboard shell (landing, loading, auth, empty states).

## Depth Strategy

**Borders only.** No drop shadows on dark surfaces. Structure comes from:
- Low-opacity borders (`slate-800/60`) for standard separation
- `gap-px` trick on grid containers — colored wrapper creates 1px dividers between items
- Surface color shifts for hover/active states

## Spacing

- Base unit: 4px (Tailwind default)
- Page padding: `px-8`
- Hero vertical rhythm: `pt-24 pb-20`
- Section spacing: `pb-24`
- Card interiors: `p-6`
- Nav bar: `px-8 py-5`
- Tight element gaps: `gap-2` to `gap-3`
- Button padding: `px-5 py-2.5` (primary), `px-4 py-1.5` (secondary/compact)

## Typography

- **System font stack** (Tailwind default) — no custom fonts
- Hero headline: `text-4xl sm:text-5xl font-light tracking-tight` with `font-medium` on the accent phrase
- Section headings: `text-2xl font-medium tracking-tight text-white`
- Body: `text-base leading-relaxed text-slate-400` or `text-sm leading-relaxed text-slate-500`
- Labels/nav: `text-sm font-medium text-white`
- Mono contexts: `font-mono text-sm text-slate-500` (terminal paths, slugs, code)
- Status chips: `text-xs font-medium` in pill containers

## Border Radius

- Buttons & inputs: `rounded-md` to `rounded-lg`
- Cards & grids: `rounded-xl`
- Logomark: `rounded-lg`
- Pills/chips: `rounded-full`
- Icon containers: `rounded-md`

## Component Patterns

### Branded Logomark
```
<div className="h-7 w-7 rounded-lg bg-indigo-500/15 flex items-center justify-center">
  <div className="h-2.5 w-2.5 rounded-sm bg-indigo-500" />
</div>
```
Frosted indigo container with solid indigo square. Used in nav bar, loading screen. Scale up for larger contexts (h-8 w-8 container, h-3 w-3 inner).

### Status Chip
```
<div className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/50 px-3 py-1 text-xs font-medium text-slate-400">
  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
  Label text
</div>
```

### 1px-Gap Bento Grid
```
<div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-800/60 bg-slate-800/30">
  <div className="bg-slate-950 p-6 hover:bg-slate-900/60 transition-colors">
    ...content...
  </div>
</div>
```
Wrapper has the border color as background. `gap-px` creates 1px dividers. Each cell has the canvas color as its own background.

### Icon Container
```
<span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-800/80 text-indigo-400">
  <svg className="h-4 w-4" .../>
</span>
```

### Primary CTA
```
<Link className="group rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition-all hover:bg-indigo-500">
  Label
  <span className="ml-2 inline-block transition-transform group-hover:translate-x-0.5">&rarr;</span>
</Link>
```

### Secondary Button (dark context)
```
<Link className="rounded-lg border border-slate-700 bg-slate-900/50 px-6 py-2.5 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white">
```

### Terminal Breadcrumb (empty states)
```
<div className="font-mono text-sm text-slate-500">
  <span className="text-indigo-500">~</span>
  <span className="text-slate-600">/</span>
  <span>context label</span>
</div>
```

### Loading Pulse Bars
```
<div className="flex gap-1">
  {[0, 1, 2].map((i) => (
    <div key={i} className="h-1 w-6 rounded-full bg-slate-700 animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
  ))}
</div>
```

## SVG Icon Style

Hand-drawn SVGs at 16x16 viewBox, `fill="none" stroke="currentColor" strokeWidth="1.5"`. Consistent with the technical, minimal aesthetic. Use `strokeLinecap="round" strokeLinejoin="round"` for softer edges.

## What NOT to Do

- No drop shadows on dark surfaces
- No gradients for decoration
- No rounded-full on buttons (reserved for pills/chips)
- No multiple accent hues — indigo only, vary opacity
- No consumer-friendly emoji or playful illustrations
- No `bg-gray-50` on full-page screens (that's dashboard-interior only)
- No heavy font weights on large text — use `font-light` or `font-medium`, never `font-bold` on hero headings
