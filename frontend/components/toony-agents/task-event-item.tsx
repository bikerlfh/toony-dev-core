"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AgentQuestionCard } from "@/components/toony-agents/agent-question-card";
import type { TaskEventItem as TaskEventItemType } from "@/types";

interface TaskEventItemProps {
  event: TaskEventItemType;
  onAnswer?: (questionId: string, answer: string) => void;
  onMessage?: (text: string) => void;
  isAnswered?: boolean;
  disabled?: boolean;
}

export function TaskEventItem({
  event,
  onAnswer,
  isAnswered,
  disabled,
}: TaskEventItemProps) {
  const [showToolDetail, setShowToolDetail] = useState(true);
  const [showToolResult, setShowToolResult] = useState(false);

  switch (event.event_type) {
    case "LOG": {
      const logText = String(event.data.message ?? event.data.text ?? "");
      const isMultiLine = logText.includes("\n");
      return (
        <div className="py-0.5">
          {isMultiLine ? (
            <div className="prose prose-invert prose-sm max-w-none prose-headings:text-slate-200 prose-p:text-slate-300 prose-a:text-indigo-400 prose-strong:text-slate-200 prose-code:text-indigo-300 prose-pre:bg-slate-950 prose-pre:border prose-pre:border-slate-800 prose-table:text-sm prose-th:text-slate-300 prose-td:text-slate-400">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {logText}
              </ReactMarkdown>
            </div>
          ) : (
            <span className="text-slate-400 font-mono text-sm">
              {logText}
            </span>
          )}
        </div>
      );
    }

    case "TOOL_USE": {
      const toolName = String(event.data.tool_name ?? "");
      const input = (event.data.input ?? {}) as Record<string, unknown>;
      const toolDetail =
        input.description ? String(input.description) :
        input.file_path ? String(input.file_path) :
        input.pattern ? String(input.pattern) :
        input.command ? String(input.command) :
        input.query ? String(input.query) :
        input.url ? String(input.url) :
        "";
      const hasExpandableDetail =
        (toolName === "Edit" && input.old_string && input.new_string) ||
        (toolName === "Write" && input.content) ||
        (toolName === "Bash" && input.command);
      return (
        <div className="py-0.5">
          <span
            className={`text-indigo-400 font-mono text-sm${hasExpandableDetail ? " cursor-pointer hover:text-indigo-300 transition-colors" : ""}`}
            onClick={hasExpandableDetail ? () => setShowToolDetail((v) => !v) : undefined}
          >
            {hasExpandableDetail ? (showToolDetail ? "▾ " : "▸ ") : "▸ "}
            {toolName}
            {toolDetail ? `: ${toolDetail}` : ""}
          </span>
          {showToolDetail && toolName === "Edit" && input.old_string && input.new_string && (
            <div className="mt-1 ml-4 rounded border border-slate-800 bg-slate-950 overflow-auto max-h-80 text-xs font-mono">
              <div className="border-b border-slate-800 px-3 py-1.5 text-slate-500">
                {String(input.file_path ?? "")}
              </div>
              {String(input.old_string) && (
                <div className="border-b border-slate-800/50">
                  <pre className="px-3 py-2 whitespace-pre-wrap bg-red-500/5 text-red-400/80">
                    {String(input.old_string).split("\n").map((line, i) => (
                      <span key={i}>{`- ${line}\n`}</span>
                    ))}
                  </pre>
                </div>
              )}
              <div>
                <pre className="px-3 py-2 whitespace-pre-wrap bg-emerald-500/5 text-emerald-400/80">
                  {String(input.new_string).split("\n").map((line, i) => (
                    <span key={i}>{`+ ${line}\n`}</span>
                  ))}
                </pre>
              </div>
            </div>
          )}
          {showToolDetail && toolName === "Write" && input.content && (
            <div className="mt-1 ml-4 rounded border border-slate-800 bg-slate-950 overflow-auto max-h-80 text-xs font-mono">
              <div className="border-b border-slate-800 px-3 py-1.5 text-slate-500">
                {String(input.file_path ?? "")}
              </div>
              <pre className="px-3 py-2 whitespace-pre-wrap text-slate-400">
                {String(input.content)}
              </pre>
            </div>
          )}
          {showToolDetail && toolName === "Bash" && input.command && (
            <pre className="mt-1 ml-4 rounded border border-slate-800 bg-slate-950 px-3 py-2 overflow-auto max-h-40 text-xs font-mono text-amber-400/80 whitespace-pre-wrap">
              $ {String(input.command)}
            </pre>
          )}
        </div>
      );
    }

    case "TOOL_RESULT": {
      const resultText = String(event.data.result ?? event.data.output ?? "");
      return (
        <div className="py-0.5">
          <button
            onClick={() => setShowToolResult((v) => !v)}
            className="text-slate-500 font-mono text-sm hover:text-slate-300 transition-colors"
          >
            {showToolResult ? "▾ Hide result" : "▸ Show result"}
          </button>
          {showToolResult && (
            <pre className="mt-1 ml-4 max-h-60 overflow-auto rounded border border-slate-800 bg-slate-950 p-2 text-xs text-slate-400 font-mono whitespace-pre-wrap">
              {resultText}
            </pre>
          )}
        </div>
      );
    }

    case "ERROR":
      return (
        <div className="py-0.5">
          <span className="text-red-400 font-mono text-sm">
            {String(event.data.message ?? event.data.error ?? "")}
          </span>
        </div>
      );

    case "STATUS_CHANGE":
      return (
        <div className="py-1">
          <span className="text-slate-500 text-xs italic">
            Status: {String(event.data.old_status ?? "?")} &rarr;{" "}
            {String(event.data.new_status ?? "?")}
          </span>
        </div>
      );

    case "QUESTION_ASKED": {
      const data = event.data as {
        question?: { text?: string; type?: string; header?: string; options?: { label: string; description?: string }[]; multi_select?: boolean };
        question_id?: string;
        text?: string;
      };
      const question = data.question;
      const questionText = question?.text ?? data.text ?? "Agent has a question";
      return (
        <div className="py-2">
          <AgentQuestionCard
            question={questionText}
            header={question?.header}
            options={question?.options}
            questionId={String(data.question_id ?? "")}
            onAnswer={onAnswer ?? (() => {})}
            isAnswered={isAnswered ?? false}
            disabled={disabled}
          />
        </div>
      );
    }

    case "QUESTION_ANSWERED":
      return (
        <div className="py-1">
          <span className="text-slate-400 text-sm">
            Your answer:{" "}
            <span className="font-medium text-slate-200">
              {String(event.data.answer ?? "")}
            </span>
          </span>
        </div>
      );

    case "REPLY":
      return (
        <div className="py-1 flex justify-end">
          <div className="rounded-lg bg-indigo-600/20 border border-indigo-500/30 px-3 py-2 max-w-[80%]">
            <span className="text-sm text-indigo-200">
              {String(event.data.message ?? "")}
            </span>
          </div>
        </div>
      );

    default:
      return (
        <div className="py-0.5">
          <span className="text-slate-500 font-mono text-xs">
            [{event.event_type}] {JSON.stringify(event.data)}
          </span>
        </div>
      );
  }
}
