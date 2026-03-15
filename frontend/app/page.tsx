"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";

/* -- Loading pulse -- */
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

/* -- Feature cards for the landing grid -- */
const FEATURES = [
  {
    label: "Issues",
    desc: "Track, prioritize, and assign work across your team.",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="6.25" />
        <path d="M5.5 8.5l2 2 3.5-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: "Cycles",
    desc: "Ship in focused sprints with automatic progress tracking.",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M13 8a5 5 0 01-9.33 2.5M3 8a5 5 0 019.33-2.5" strokeLinecap="round" />
        <path d="M3 13V10.5h2.5M13 3v2.5h-2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: "Projects",
    desc: "Milestones, members, and settings — organized by scope.",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="3" width="12" height="10" rx="1.5" />
        <path d="M2 6h12" />
      </svg>
    ),
  },
  {
    label: "Agents",
    desc: "Automate workflows with configurable skills and triggers.",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="4" y="2" width="8" height="5" rx="1.5" />
        <path d="M6 7v2.5a1.5 1.5 0 001.5 1.5h1a1.5 1.5 0 001.5-1.5V7M8 11v3M5.5 14h5" strokeLinecap="round" />
      </svg>
    ),
  },
];

/* -- Unauthenticated landing -- */
function LandingPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      {/* Nav bar */}
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

      {/* Hero */}
      <div className="mx-auto max-w-3xl px-8 pt-24 pb-20">
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

          <p className="mt-5 max-w-md text-base leading-relaxed text-slate-400">
            Issue tracking, cycles, and automation for teams that move fast.
            Built for developers who care about their tools.
          </p>

          <div className="mt-10 flex items-center gap-4">
            <Link
              href="/login"
              className="group relative rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition-all hover:bg-indigo-500"
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

      {/* Feature grid */}
      <div className="mx-auto max-w-3xl px-8 pb-24">
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-slate-800/60 bg-slate-800/30 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div
              key={f.label}
              className="bg-slate-950 p-6 transition-colors hover:bg-slate-900/60"
            >
              <div className="mb-3 flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-800/80 text-indigo-400">
                  {f.icon}
                </span>
                <span className="text-sm font-medium text-white">{f.label}</span>
              </div>
              <p className="text-sm leading-relaxed text-slate-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer line */}
      <div className="border-t border-slate-800/60 px-8 py-5">
        <p className="text-center text-xs text-slate-600">
          Toony Dev Core &mdash; open source project management
        </p>
      </div>
    </main>
  );
}

/* -- Root page -- */
export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (isAuthenticated) {
    return <LoadingScreen />;
  }

  return <LandingPage />;
}
