"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  rows?: number;
}

type Tab = "write" | "preview";

export function MarkdownEditor({
  value,
  onChange,
  label,
  placeholder,
  rows = 28,
}: MarkdownEditorProps) {
  const [activeTab, setActiveTab] = useState<Tab>("write");

  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        {label && (
          <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
            {label}
          </span>
        )}
        <div className="flex gap-0.5 rounded-md bg-slate-800/60 p-0.5">
          <button
            type="button"
            onClick={() => setActiveTab("write")}
            className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === "write"
                ? "bg-slate-700 text-slate-200"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Write
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("preview")}
            className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === "preview"
                ? "bg-slate-700 text-slate-200"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Preview
          </button>
        </div>
      </div>

      {activeTab === "write" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          className="block w-full resize-y rounded-md border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-sm leading-relaxed text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
          placeholder={placeholder}
        />
      ) : (
        <div
          className="min-h-[200px] rounded-md border border-slate-700 bg-slate-950 px-4 py-3"
          style={{ minHeight: `${rows * 1.625 + 1.25}rem` }}
        >
          {value.trim() ? (
            <div className="prose prose-invert prose-sm max-w-none prose-headings:text-slate-200 prose-p:text-slate-300 prose-a:text-indigo-400 prose-strong:text-slate-200 prose-code:text-indigo-300 prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-700">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {value}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm italic text-slate-600">Nothing to preview</p>
          )}
        </div>
      )}
    </div>
  );
}
