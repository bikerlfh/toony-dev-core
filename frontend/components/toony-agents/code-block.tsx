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
        if (!cancelled) setHtml("");
      }
    }

    highlight();
    return () => { cancelled = true; };
  }, [code, lang]);

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
