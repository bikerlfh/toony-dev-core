"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useOrg } from "@/contexts/org-context";
import { useDebounce } from "@/hooks/use-debounce";
import { globalSearch } from "@/lib/api/search";
import type { GlobalSearchResult } from "@/types";

export function SearchCommandPalette() {
  const router = useRouter();
  const { currentOrg } = useOrg();
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
    if (!debouncedQuery.trim() || !currentOrg) {
      setResults(null);
      return;
    }
    setIsLoading(true);
    globalSearch(currentOrg.slug, debouncedQuery)
      .then(setResults)
      .catch(() => setResults(null))
      .finally(() => setIsLoading(false));
  }, [debouncedQuery, currentOrg]);

  function navigate(path: string) {
    close();
    router.push(path);
  }

  if (!isOpen || !currentOrg) return null;

  const basePath = `/${currentOrg.slug}`;
  const hasResults =
    results &&
    (results.issues.length > 0 ||
      results.projects.length > 0 ||
      results.teams.length > 0 ||
      results.labels.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={close} />

      {/* Palette */}
      <div className="relative w-full max-w-lg rounded-lg bg-white shadow-2xl">
        {/* Search input */}
        <div className="flex items-center border-b border-gray-200 px-4">
          <svg
            className="h-5 w-5 text-gray-400"
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
            className="w-full border-0 px-3 py-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
          />
          <kbd className="rounded border border-gray-200 px-1.5 py-0.5 text-xs text-gray-400">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {isLoading && (
            <div className="px-4 py-6 text-center text-sm text-gray-500">
              Searching...
            </div>
          )}

          {!isLoading && query && !hasResults && (
            <div className="px-4 py-6 text-center text-sm text-gray-500">
              No results found.
            </div>
          )}

          {!isLoading && hasResults && (
            <div className="py-2">
              {/* Issues */}
              {results.issues.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-xs font-semibold uppercase text-gray-400">
                    Issues
                  </div>
                  {results.issues.map((issue) => (
                    <button
                      key={issue.id}
                      onClick={() =>
                        navigate(
                          `${basePath}/projects/${issue.identifier.split("-")[0].toLowerCase()}/${issue.identifier}`
                        )
                      }
                      className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-gray-100"
                    >
                      <span className="font-mono text-xs text-gray-400">
                        {issue.identifier}
                      </span>
                      <span className="truncate text-gray-900">
                        {issue.title}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Projects */}
              {results.projects.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-xs font-semibold uppercase text-gray-400">
                    Projects
                  </div>
                  {results.projects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() =>
                        navigate(`${basePath}/projects/${project.slug}`)
                      }
                      className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-gray-100"
                    >
                      <span className="truncate text-gray-900">
                        {project.name}
                      </span>
                      <span className="text-xs text-gray-400">
                        {project.status.replace(/_/g, " ")}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Teams */}
              {results.teams.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-xs font-semibold uppercase text-gray-400">
                    Teams
                  </div>
                  {results.teams.map((team) => (
                    <button
                      key={team.id}
                      onClick={() =>
                        navigate(`${basePath}/teams/${team.slug}`)
                      }
                      className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-gray-100"
                    >
                      <span className="truncate text-gray-900">
                        {team.name}
                      </span>
                      <span className="font-mono text-xs text-gray-400">
                        {team.identifier}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Labels */}
              {results.labels.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-xs font-semibold uppercase text-gray-400">
                    Labels
                  </div>
                  {results.labels.map((label) => (
                    <button
                      key={label.id}
                      onClick={() => navigate(`${basePath}/labels`)}
                      className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-gray-100"
                    >
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: label.color }}
                      />
                      <span className="truncate text-gray-900">
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
