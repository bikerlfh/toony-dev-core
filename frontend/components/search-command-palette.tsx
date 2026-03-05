"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDebounce } from "@/hooks/use-debounce";
import { globalSearch } from "@/lib/api/search";
import type { GlobalSearchResult } from "@/types";

export function SearchCommandPalette() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query, 300);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setResults(null);
  }, []);

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        close();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [close]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Search on debounced query
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults(null);
      return;
    }
    setIsLoading(true);
    globalSearch(debouncedQuery)
      .then(setResults)
      .catch(() => setResults(null))
      .finally(() => setIsLoading(false));
  }, [debouncedQuery]);

  function navigate(path: string) {
    close();
    router.push(path);
  }

  if (!isOpen) return null;

  const hasResults =
    results &&
    (results.issues.length > 0 ||
      results.projects.length > 0 ||
      results.teams.length > 0 ||
      results.labels.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60" onClick={close} />

      {/* Palette */}
      <div className="relative w-full max-w-lg rounded-xl border border-slate-800/60 bg-slate-900">
        {/* Search input */}
        <div className="flex items-center border-b border-slate-800/60 px-4">
          <svg
            className="h-5 w-5 text-slate-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search issues, projects, teams, labels..."
            className="w-full border-0 bg-transparent px-3 py-4 text-sm text-slate-200 placeholder-slate-500 focus:outline-none"
          />
          <kbd className="rounded border border-slate-700 px-1.5 py-0.5 text-xs text-slate-500">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {isLoading && (
            <div className="px-4 py-6 text-center text-sm text-slate-500">
              Searching...
            </div>
          )}

          {!isLoading && query && !hasResults && (
            <div className="px-4 py-6 text-center text-sm text-slate-500">
              No results found.
            </div>
          )}

          {!isLoading && hasResults && (
            <div className="py-2">
              {/* Issues */}
              {results.issues.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-xs font-semibold uppercase text-slate-600">
                    Issues
                  </div>
                  {results.issues.map((issue) => (
                    <button
                      key={issue.id}
                      onClick={() =>
                        navigate(
                          `/projects/${issue.project_id}/issues/${issue.id}`
                        )
                      }
                      className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-slate-800/60"
                    >
                      <span className="font-mono text-xs text-slate-500">
                        {issue.identifier}
                      </span>
                      <span className="truncate text-slate-200">
                        {issue.title}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Projects */}
              {results.projects.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-xs font-semibold uppercase text-slate-600">
                    Projects
                  </div>
                  {results.projects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() =>
                        navigate(`/projects/${project.id}`)
                      }
                      className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-slate-800/60"
                    >
                      <span className="truncate text-slate-200">
                        {project.name}
                      </span>
                      <span className="text-xs text-slate-500">
                        {project.status.replace(/_/g, " ")}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Teams */}
              {results.teams.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-xs font-semibold uppercase text-slate-600">
                    Teams
                  </div>
                  {results.teams.map((team) => (
                    <button
                      key={team.id}
                      onClick={() =>
                        navigate(`/teams/${team.id}`)
                      }
                      className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-slate-800/60"
                    >
                      <span className="truncate text-slate-200">
                        {team.name}
                      </span>
                      <span className="font-mono text-xs text-slate-500">
                        {team.identifier}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Labels */}
              {results.labels.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-xs font-semibold uppercase text-slate-600">
                    Labels
                  </div>
                  {results.labels.map((label) => (
                    <button
                      key={label.id}
                      onClick={() => navigate(`/labels`)}
                      className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-slate-800/60"
                    >
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: label.color }}
                      />
                      <span className="truncate text-slate-200">
                        {label.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
