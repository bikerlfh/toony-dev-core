"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";

/* ── Loading screen ─────────────────────────────────────────── */
function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="flex flex-col items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
            <div className="h-3 w-3 rounded-sm bg-indigo-500 animate-pulse" />
          </div>
          <span className="text-lg font-medium tracking-tight text-slate-300">
            toony
          </span>
        </div>
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-1 w-6 rounded-full bg-slate-700 animate-pulse"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

/* ── Terminal section label ─────────────────────────────────── */
function SectionPath({ children }: { children: string }) {
  return (
    <div className="mb-3 font-mono text-sm">
      <span className="text-indigo-500">~</span>
      <span className="text-slate-700">/</span>
      <span className="text-slate-500">{children}</span>
    </div>
  );
}

/* ── Bento cell (reusable) ──────────────────────────────────── */
function Cell({
  icon,
  label,
  desc,
  span,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  desc: string;
  span?: number;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`bg-slate-950 p-6 transition-colors hover:bg-slate-900/60${
        span === 2 ? " sm:col-span-2" : ""
      }`}
    >
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-800/80 text-indigo-400">
          {icon}
        </span>
        <span className="text-sm font-medium text-white">{label}</span>
      </div>
      <p className="text-sm leading-relaxed text-slate-500">{desc}</p>
      {children}
    </div>
  );
}

/* ── Inline feature row (for developer section) ─────────────── */
function InlineFeature({
  icon,
  label,
  desc,
}: {
  icon: React.ReactNode;
  label: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg px-1 py-2">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-800/80 text-indigo-400">
        {icon}
      </span>
      <div>
        <span className="text-sm font-medium text-white">{label}</span>
        <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{desc}</p>
      </div>
    </div>
  );
}

/* ── SVG icons (16×16, stroke-only) ─────────────────────────── */
const s = { fill: "none", stroke: "currentColor", strokeWidth: 1.5 } as const;
const cap = { strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const icons = {
  issues: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" {...s}>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M5.5 8.5l2 2 3.5-4" {...cap} />
    </svg>
  ),
  kanban: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" {...s}>
      <rect x="1.5" y="2" width="3.5" height="12" rx=".75" />
      <rect x="6.25" y="2" width="3.5" height="8" rx=".75" />
      <rect x="11" y="2" width="3.5" height="10" rx=".75" />
    </svg>
  ),
  projects: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" {...s}>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M2 6h12" />
    </svg>
  ),
  cycles: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" {...s}>
      <path d="M13 8a5 5 0 01-9.33 2.5M3 8a5 5 0 019.33-2.5" strokeLinecap="round" />
      <path d="M3 13V10.5h2.5M13 3v2.5h-2.5" {...cap} />
    </svg>
  ),
  milestones: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" {...s}>
      <path d="M3 14V2m0 0l7 3.5L3 9" {...cap} />
    </svg>
  ),
  agents: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" {...s}>
      <rect x="4" y="2" width="8" height="5" rx="1.5" />
      <path d="M6 7v2.5a1.5 1.5 0 001.5 1.5h1a1.5 1.5 0 001.5-1.5V7M8 11v3M5.5 14h5" strokeLinecap="round" />
    </svg>
  ),
  workflows: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" {...s}>
      <circle cx="3" cy="8" r="1.5" />
      <circle cx="8" cy="4" r="1.5" />
      <circle cx="8" cy="12" r="1.5" />
      <circle cx="13" cy="8" r="1.5" />
      <path d="M4.5 7L6.5 5M4.5 9l2 2M9.5 5l2 2M9.5 11l2-2" strokeLinecap="round" />
    </svg>
  ),
  skills: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" {...s}>
      <path d="M5 3L2.5 8 5 13M11 3l2.5 5L11 13" {...cap} />
      <path d="M9.5 3.5l-3 9" strokeLinecap="round" />
    </svg>
  ),
  artifacts: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" {...s}>
      <path d="M4.5 2h5l3 3v8.5a1 1 0 01-1 1h-7a1 1 0 01-1-1V3a1 1 0 011-1z" />
      <path d="M9.5 2v3h3" {...cap} />
      <path d="M6.5 8.5h3M6.5 10.5h5" strokeLinecap="round" />
    </svg>
  ),
  orgs: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" {...s}>
      <rect x="4" y="1.5" width="8" height="4" rx="1" />
      <rect x="1" y="8.5" width="5.5" height="6" rx="1" />
      <rect x="9.5" y="8.5" width="5.5" height="6" rx="1" />
      <path d="M8 5.5v3M5 8.5L8 8.5M11 8.5l-3 0" strokeLinecap="round" />
    </svg>
  ),
  teams: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" {...s}>
      <circle cx="5.5" cy="4.5" r="2" />
      <path d="M1.5 13a4 4 0 018 0" strokeLinecap="round" />
      <circle cx="11" cy="5" r="1.75" />
      <path d="M14.5 13a3 3 0 00-6 0" strokeLinecap="round" />
    </svg>
  ),
  notifications: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" {...s}>
      <path d="M4 6.5a4 4 0 018 0v2.5l1.5 2H2.5L4 9V6.5z" {...cap} />
      <path d="M6.5 13a1.5 1.5 0 003 0" strokeLinecap="round" />
    </svg>
  ),
  labels: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" {...s}>
      <path d="M2 8.5V3a1 1 0 011-1h5.5L14 7.5 8.5 13z" {...cap} />
      <circle cx="5.5" cy="5.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  realtime: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" {...s}>
      <path d="M8 12V4M4 8l4-4 4 4" {...cap} />
      <path d="M2 14h12" strokeLinecap="round" />
    </svg>
  ),
  dashboard: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" {...s}>
      <rect x="2" y="2" width="5" height="6" rx="1" />
      <rect x="9" y="2" width="5" height="3.5" rx="1" />
      <rect x="2" y="10" width="5" height="4" rx="1" />
      <rect x="9" y="7.5" width="5" height="6.5" rx="1" />
    </svg>
  ),
  search: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" {...s}>
      <circle cx="7" cy="7" r="4.25" />
      <path d="M10 10l3.5 3.5" strokeLinecap="round" />
    </svg>
  ),
  import: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" {...s}>
      <path d="M8 2v8M5 7l3 3 3-3" {...cap} />
      <path d="M2.5 11v2.5h11V11" strokeLinecap="round" />
    </svg>
  ),
  apikeys: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" {...s}>
      <circle cx="5.5" cy="8" r="3" />
      <path d="M8.5 8H14M11 6v4M13 6v4" strokeLinecap="round" />
    </svg>
  ),
  rbac: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" {...s}>
      <path d="M8 1.5L2.5 4v4c0 3.5 2.5 5.5 5.5 6.5 3-1 5.5-3 5.5-6.5V4z" {...cap} />
      <path d="M6 8l1.5 1.5L10 7" {...cap} />
    </svg>
  ),
};

/* ── Landing page ───────────────────────────────────────────── */
function LandingPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      {/* ── Nav ──────────────────────────────────────────────── */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-lg bg-indigo-500/15 flex items-center justify-center">
            <div className="h-2.5 w-2.5 rounded-sm bg-indigo-500" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-white">
            toony
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="rounded-md px-4 py-1.5 text-sm font-medium text-slate-400 transition-colors hover:text-white"
          >
            Sign in
          </Link>
          <Link
            href="/login"
            className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className="mx-auto max-w-5xl px-8 pt-24 pb-16">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/50 px-3 py-1 text-xs font-medium text-slate-400">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Open source project management
          </div>

          <h1 className="text-4xl font-light tracking-tight text-white sm:text-5xl">
            Ship software,
            <br />
            <span className="font-medium text-indigo-400">not spreadsheets.</span>
          </h1>

          <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-400">
            Issue tracking, sprint cycles, AI agents, and workflow automation
            — built for teams that ship fast and care about their tools.
          </p>

          <div className="mt-10 flex items-center gap-4">
            <Link
              href="/login"
              className="group rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition-all hover:bg-indigo-500"
            >
              Start building
              <span className="ml-2 inline-block transition-transform group-hover:translate-x-0.5">
                &rarr;
              </span>
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-slate-700 bg-slate-900/50 px-6 py-2.5 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>

      {/* ── Terminal prompt separator ────────────────────────── */}
      <div className="mx-auto max-w-5xl px-8 pb-20">
        <div className="flex items-center justify-center">
          <div className="rounded-lg border border-slate-800/60 bg-slate-900/30 px-4 py-2 font-mono text-xs">
            <span className="text-indigo-500">$</span>
            <span className="text-slate-400"> toony init</span>
            <span className="text-slate-600">
              {" "}
              --issues --agents --workflows --realtime
            </span>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* SECTION: Plan & Ship                                   */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section className="mx-auto max-w-5xl px-8 pb-24">
        <SectionPath>plan-and-ship</SectionPath>
        <h2 className="text-2xl font-medium tracking-tight text-white mb-2">
          Plan, track, and ship
        </h2>
        <p className="text-sm leading-relaxed text-slate-400 mb-8 max-w-md">
          Everything you need to manage work — from backlog to production.
        </p>

        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-slate-800/60 bg-slate-800/30 sm:grid-cols-3">
          {/* Issues — spans 2 cols */}
          <Cell
            icon={icons.issues}
            label="Issues"
            desc="Track, prioritize, and assign work. Sub-issues, labels, milestones, due dates, estimation, comments, and full activity history."
            span={2}
          >
            <div className="mt-4 space-y-1">
              {[
                {
                  id: "TON-42",
                  title: "Implement dark mode toggle",
                  dot: "bg-amber-500",
                  prio: "High",
                  pc: "bg-orange-500/15 text-orange-400",
                },
                {
                  id: "TON-41",
                  title: "WebSocket reconnection logic",
                  dot: "bg-indigo-500",
                  prio: "Medium",
                  pc: "bg-amber-500/15 text-amber-400",
                },
                {
                  id: "TON-40",
                  title: "Fix pagination edge case",
                  dot: "bg-emerald-500",
                  prio: "Low",
                  pc: "bg-blue-500/15 text-blue-400",
                },
              ].map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-2 rounded-md bg-slate-900/80 px-2.5 py-1.5 text-xs"
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.dot}`}
                  />
                  <span className="font-mono text-slate-600">{r.id}</span>
                  <span className="truncate text-slate-400">{r.title}</span>
                  <span
                    className={`ml-auto shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium ${r.pc}`}
                  >
                    {r.prio}
                  </span>
                </div>
              ))}
            </div>
          </Cell>

          {/* Kanban Board */}
          <Cell
            icon={icons.kanban}
            label="Kanban Board"
            desc="Visual workflow with drag-and-drop across projects."
          >
            <div className="mt-4 flex gap-1.5">
              {[
                { name: "Backlog", n: 2, c: "bg-slate-800/60" },
                { name: "Active", n: 1, c: "bg-indigo-500/15" },
                { name: "Done", n: 3, c: "bg-emerald-500/10" },
              ].map((col) => (
                <div key={col.name} className="flex-1">
                  <div className="mb-1 text-[10px] text-slate-600">
                    {col.name}
                  </div>
                  <div className="space-y-1">
                    {Array.from({ length: col.n }).map((_, i) => (
                      <div key={i} className={`h-4 rounded ${col.c}`} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Cell>

          {/* Projects */}
          <Cell
            icon={icons.projects}
            label="Projects"
            desc="Milestones, members, repository settings, and custom configuration per project."
          />

          {/* Cycles */}
          <Cell
            icon={icons.cycles}
            label="Cycles"
            desc="Ship in focused sprints with automatic progress tracking."
          />

          {/* Milestones */}
          <Cell
            icon={icons.milestones}
            label="Milestones"
            desc="Set target dates and track progress toward major deliverables."
          />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* SECTION: AI & Automation                               */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section className="mx-auto max-w-5xl px-8 pb-24">
        <SectionPath>ai-agents</SectionPath>
        <h2 className="text-2xl font-medium tracking-tight text-white mb-2">
          AI-powered development
        </h2>
        <p className="text-sm leading-relaxed text-slate-400 mb-8 max-w-md">
          Configurable agents with skills, real-time task tracking, and
          automated workflows.
        </p>

        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-slate-800/60 bg-slate-800/30 sm:grid-cols-2">
          {/* AI Agents */}
          <Cell
            icon={icons.agents}
            label="AI Agents"
            desc="Configure agent templates — Coder, Reviewer, Tester, Planner — with versioned skills and heartbeat monitoring."
          >
            <div className="mt-4 space-y-1.5">
              {[
                { name: "code-reviewer", st: "online", tasks: 3 },
                { name: "test-runner", st: "busy", tasks: 1 },
                { name: "planner-v2", st: "offline", tasks: 0 },
              ].map((a) => (
                <div
                  key={a.name}
                  className="flex items-center gap-2 rounded-md bg-slate-900/80 px-2.5 py-1.5 text-xs"
                >
                  <span className="relative flex h-2 w-2">
                    {a.st === "online" && (
                      <span className="absolute h-2 w-2 rounded-full bg-emerald-500 animate-ping opacity-75" />
                    )}
                    <span
                      className={`h-2 w-2 rounded-full ${
                        a.st === "online"
                          ? "bg-emerald-500"
                          : a.st === "busy"
                            ? "bg-amber-500"
                            : "bg-slate-600"
                      }`}
                    />
                  </span>
                  <span className="font-mono text-slate-400">{a.name}</span>
                  <span className="ml-auto text-slate-600">
                    {a.tasks} tasks
                  </span>
                </div>
              ))}
            </div>
          </Cell>

          {/* Workflows */}
          <Cell
            icon={icons.workflows}
            label="Workflows"
            desc="DAG-based workflow editor with scope triggers — global, organization, or project level."
          >
            <div className="mt-4 flex items-center justify-center gap-0 py-2">
              {[
                {
                  label: "trigger",
                  border: "border-slate-700",
                  bg: "bg-slate-900",
                  text: "text-slate-500",
                },
                {
                  label: "review",
                  border: "border-indigo-500/30",
                  bg: "bg-indigo-500/10",
                  text: "text-indigo-400",
                },
                {
                  label: "deploy",
                  border: "border-emerald-500/30",
                  bg: "bg-emerald-500/10",
                  text: "text-emerald-400",
                },
              ].map((node, i) => (
                <div key={node.label} className="flex items-center">
                  {i > 0 && <div className="h-px w-5 bg-slate-700" />}
                  <div
                    className={`flex h-7 w-16 items-center justify-center rounded border ${node.border} ${node.bg} text-[9px] font-medium ${node.text}`}
                  >
                    {node.label}
                  </div>
                </div>
              ))}
            </div>
          </Cell>

          {/* Skills */}
          <Cell
            icon={icons.skills}
            label="Skills"
            desc="Reusable AI capabilities with input/output schemas, versioning, and changelog tracking."
          />

          {/* Artifacts */}
          <Cell
            icon={icons.artifacts}
            label="Artifacts"
            desc="Plans, design docs, tech specs, and test plans — with a full approval workflow."
          />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* SECTION: Scale & Collaborate                           */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section className="mx-auto max-w-5xl px-8 pb-24">
        <SectionPath>collaborate</SectionPath>
        <h2 className="text-2xl font-medium tracking-tight text-white mb-2">
          Scale your team
        </h2>
        <p className="text-sm leading-relaxed text-slate-400 mb-8 max-w-md">
          Multi-org support, role-based access, and real-time collaboration.
        </p>

        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-slate-800/60 bg-slate-800/30 sm:grid-cols-2 lg:grid-cols-4">
          <Cell
            icon={icons.orgs}
            label="Organizations"
            desc="Multi-org support with five role levels, settings, credentials, and integrations."
          />
          <Cell
            icon={icons.teams}
            label="Teams"
            desc="Group members with lead and member roles, assign teams to projects."
          />
          <Cell
            icon={icons.notifications}
            label="Notifications"
            desc="Event-based alerts for assignments, status changes, comments, and agent tasks."
          />
          <Cell
            icon={icons.labels}
            label="Labels"
            desc="Color-coded labels scoped to your organization for cross-project tagging."
          />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* SECTION: Built for Developers                          */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section className="mx-auto max-w-5xl px-8 pb-24">
        <SectionPath>developer-infra</SectionPath>
        <h2 className="text-2xl font-medium tracking-tight text-white mb-2">
          Built for developers
        </h2>
        <p className="text-sm leading-relaxed text-slate-400 mb-8 max-w-md">
          The infrastructure behind the interface.
        </p>

        <div className="grid grid-cols-1 gap-x-12 gap-y-2 sm:grid-cols-2">
          <InlineFeature
            icon={icons.realtime}
            label="Real-time updates"
            desc="WebSocket integration for live issue, comment, and agent events — no polling."
          />
          <InlineFeature
            icon={icons.dashboard}
            label="Personal dashboard"
            desc="Stats, my issues, agent tasks, projects, artifacts, and active workflows at a glance."
          />
          <InlineFeature
            icon={icons.search}
            label="Global search"
            desc="Find issues, projects, teams, and labels across your entire organization."
          />
          <InlineFeature
            icon={icons.import}
            label="Data import"
            desc="Migrate from Linear, Jira, or Trello with progress tracking and error logging."
          />
          <InlineFeature
            icon={icons.apikeys}
            label="API keys"
            desc="Programmatic access for integrations, CI/CD, and MCP server connections."
          />
          <InlineFeature
            icon={icons.rbac}
            label="Role-based access"
            desc="Granular permissions at organization, project, and team level."
          />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* CTA                                                    */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section className="mx-auto max-w-5xl px-8 pb-24">
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/30 px-8 py-14 text-center">
          <h2 className="text-2xl font-medium tracking-tight text-white mb-3">
            Ready to ship?
          </h2>
          <p className="text-sm leading-relaxed text-slate-400 mb-8 max-w-sm mx-auto">
            Open source, self-hosted, and built for teams that move fast.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/login"
              className="group rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition-all hover:bg-indigo-500"
            >
              Get started
              <span className="ml-2 inline-block transition-transform group-hover:translate-x-0.5">
                &rarr;
              </span>
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-slate-700 bg-slate-900/50 px-6 py-2.5 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <div className="border-t border-slate-800/60 px-8 py-5">
        <p className="text-center text-xs text-slate-600">
          Toony Dev Core &mdash; open source project management
        </p>
      </div>
    </main>
  );
}

/* ── Root page ──────────────────────────────────────────────── */
export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) return <LoadingScreen />;
  if (isAuthenticated) return <LoadingScreen />;

  return <LandingPage />;
}
