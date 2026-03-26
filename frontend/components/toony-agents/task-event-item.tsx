"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AgentQuestionCard } from "@/components/toony-agents/agent-question-card";
import { CodeBlock } from "@/components/toony-agents/code-block";
import type { TaskEventItem as TaskEventItemType } from "@/types";

interface TaskEventItemProps {
  event: TaskEventItemType;
  toolResult?: Record<string, unknown>;
  onAnswer?: (questionId: string, answer: string) => void;
  onMessage?: (text: string) => void;
  isAnswered?: boolean;
  disabled?: boolean;
}

export function TaskEventItem({
  event,
  toolResult,
  onAnswer,
  onMessage,
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
      const resultContent = toolResult
        ? String(toolResult.content ?? toolResult.result ?? toolResult.output ?? "")
        : "";
      const resultIsError = Boolean(toolResult?.is_error);

      const toolDetail =
        input.description ? String(input.description) :
        input.file_path ? String(input.file_path) :
        input.pattern ? String(input.pattern) :
        input.command ? String(input.command) :
        input.query ? String(input.query) :
        input.url ? String(input.url) :
        input.prompt ? String(input.prompt).slice(0, 80) :
        input.skill ? String(input.skill) :
        "";

      const isExpandable =
        (toolName === "Edit" && input.old_string && input.new_string) ||
        (toolName === "Write" && input.content) ||
        (toolName === "Bash" && input.command) ||
        (toolName === "Read" && input.file_path) ||
        (toolName === "Grep" && input.pattern) ||
        (toolName === "Glob" && input.pattern) ||
        toolName === "WebFetch" || toolName === "WebSearch" ||
        Boolean(resultContent);

      return (
        <div className="py-0.5">
          <span
            className={`text-indigo-400 font-mono text-sm${isExpandable ? " cursor-pointer hover:text-indigo-300 transition-colors" : ""}`}
            onClick={isExpandable ? () => setShowToolDetail((v) => !v) : undefined}
          >
            {isExpandable ? (showToolDetail ? "▾ " : "▸ ") : "▸ "}
            {toolName}
            {toolDetail ? `: ${toolDetail}` : ""}
            {toolResult && (
              <span className={`ml-2 text-xs ${resultIsError ? "text-red-400" : "text-emerald-400"}`}>
                {resultIsError ? "\u2717" : "\u2713"}
              </span>
            )}
          </span>

          {showToolDetail && (
            <div className="mt-1 ml-4">
              {toolName === "Edit" && Boolean(input.old_string) && Boolean(input.new_string) && (
                <div className="rounded border border-slate-800 bg-slate-950 overflow-auto max-h-80 text-xs font-mono">
                  <div className="border-b border-slate-800 px-3 py-1.5 text-slate-500">
                    {String(input.file_path ?? "")}
                  </div>
                  <div className="border-b border-slate-800/50">
                    <pre className="px-3 py-2 whitespace-pre-wrap bg-red-500/5 text-red-400/80">
                      {String(input.old_string).split("\n").map((line, i) => (
                        <span key={i}>{`- ${line}\n`}</span>
                      ))}
                    </pre>
                  </div>
                  <div>
                    <pre className="px-3 py-2 whitespace-pre-wrap bg-emerald-500/5 text-emerald-400/80">
                      {String(input.new_string).split("\n").map((line, i) => (
                        <span key={i}>{`+ ${line}\n`}</span>
                      ))}
                    </pre>
                  </div>
                </div>
              )}

              {toolName === "Write" && Boolean(input.content) && (
                <div className="rounded border border-slate-800 bg-slate-950 overflow-hidden">
                  <div className="border-b border-slate-800 px-3 py-1.5 text-slate-500 text-xs font-mono">
                    {String(input.file_path ?? "")}
                  </div>
                  <CodeBlock
                    code={String(input.content)}
                    fileName={String(input.file_path ?? "")}
                  />
                </div>
              )}

              {toolName === "Bash" && Boolean(input.command) && (
                <div className="rounded border border-slate-800 bg-slate-950 overflow-hidden">
                  <pre className="px-3 py-2 text-xs font-mono text-amber-400/80 whitespace-pre-wrap border-b border-slate-800">
                    $ {String(input.command)}
                  </pre>
                  {resultContent && (
                    <pre className={`px-3 py-2 overflow-auto max-h-60 text-xs font-mono whitespace-pre-wrap ${resultIsError ? "text-red-400/80" : "text-slate-400"}`}>
                      {resultContent}
                    </pre>
                  )}
                </div>
              )}

              {toolName === "Read" && Boolean(input.file_path) && resultContent && (
                <div className="rounded border border-slate-800 bg-slate-950 overflow-hidden">
                  <div className="border-b border-slate-800 px-3 py-1.5 text-slate-500 text-xs font-mono">
                    {String(input.file_path)}
                  </div>
                  <CodeBlock
                    code={resultContent}
                    fileName={String(input.file_path)}
                  />
                </div>
              )}

              {toolName === "Grep" && resultContent && (
                <pre className="rounded border border-slate-800 bg-slate-950 px-3 py-2 overflow-auto max-h-60 text-xs font-mono text-slate-400 whitespace-pre-wrap">
                  {resultContent}
                </pre>
              )}

              {toolName === "Glob" && resultContent && (
                <pre className="rounded border border-slate-800 bg-slate-950 px-3 py-2 overflow-auto max-h-60 text-xs font-mono text-slate-400 whitespace-pre-wrap">
                  {resultContent}
                </pre>
              )}

              {(toolName === "WebFetch" || toolName === "WebSearch") && resultContent && (
                <pre className="rounded border border-slate-800 bg-slate-950 px-3 py-2 overflow-auto max-h-60 text-xs font-mono text-slate-400 whitespace-pre-wrap">
                  {resultContent}
                </pre>
              )}

              {!["Edit", "Write", "Bash", "Read", "Grep", "Glob", "WebFetch", "WebSearch"].includes(toolName) && (
                <>
                  {Object.keys(input).length > 0 && (
                    <pre className="rounded border border-slate-800 bg-slate-950 px-3 py-2 overflow-auto max-h-40 text-xs font-mono text-slate-400 whitespace-pre-wrap">
                      {JSON.stringify(input, null, 2)}
                    </pre>
                  )}
                  {resultContent && (
                    <pre className="mt-1 rounded border border-slate-800 bg-slate-950 px-3 py-2 overflow-auto max-h-60 text-xs font-mono text-slate-400 whitespace-pre-wrap">
                      {resultContent}
                    </pre>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      );
    }

    case "TOOL_RESULT": {
      const resultText = String(event.data.content ?? event.data.result ?? event.data.output ?? "");
      const isError = Boolean(event.data.is_error);
      return (
        <div className="py-0.5">
          <button
            onClick={() => setShowToolResult((v) => !v)}
            className={`font-mono text-sm hover:text-slate-300 transition-colors ${isError ? "text-red-400" : "text-slate-500"}`}
          >
            {showToolResult ? "\u25be Hide result" : "\u25b8 Show result"}
            {isError && " (error)"}
          </button>
          {showToolResult && (
            <pre className={`mt-1 ml-4 max-h-60 overflow-auto rounded border border-slate-800 bg-slate-950 p-2 text-xs font-mono whitespace-pre-wrap ${isError ? "text-red-400/80" : "text-slate-400"}`}>
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

    case "TOOL_APPROVAL": {
      const data = event.data as {
        request_id?: string;
        tool_name?: string;
        tool_input?: Record<string, unknown>;
        status?: string;
        timeout?: number;
      };
      const toolName = String(data.tool_name ?? "");
      const input = (data.tool_input ?? {}) as Record<string, unknown>;
      const requestId = String(data.request_id ?? "");
      const status = String(data.status ?? "pending");
      const isPending = status === "pending";

      const toolDetail =
        input.description ? String(input.description) :
        input.file_path ? String(input.file_path) :
        input.command ? String(input.command) :
        input.pattern ? String(input.pattern) :
        "";

      return (
        <div className="py-2">
          <div className={`rounded-lg border px-4 py-3 ${
            isPending
              ? "border-amber-500/50 bg-amber-500/5"
              : status === "allowed"
                ? "border-emerald-500/30 bg-emerald-500/5 opacity-60"
                : "border-red-500/30 bg-red-500/5 opacity-60"
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-amber-400 font-mono text-sm font-medium">
                  {toolName}
                </span>
                {toolDetail && (
                  <span className="text-slate-400 font-mono text-sm ml-2">
                    {toolDetail}
                  </span>
                )}
              </div>
              {isPending && !disabled && onMessage && (
                <div className="flex gap-2">
                  <button
                    onClick={() => onMessage(JSON.stringify({ type: "tool_approval", request_id: requestId, decision: "allow" }))}
                    className="px-3 py-1 text-xs font-medium rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                  >
                    Allow
                  </button>
                  <button
                    onClick={() => onMessage(JSON.stringify({ type: "tool_approval", request_id: requestId, decision: "deny" }))}
                    className="px-3 py-1 text-xs font-medium rounded bg-red-600 hover:bg-red-500 text-white transition-colors"
                  >
                    Deny
                  </button>
                </div>
              )}
              {!isPending && (
                <span className={`text-xs font-medium ${status === "allowed" ? "text-emerald-400" : "text-red-400"}`}>
                  {status === "allowed" ? "Allowed" : "Denied"}
                </span>
              )}
            </div>
            {Object.keys(input).length > 0 && (
              <pre className="mt-2 text-xs font-mono text-slate-500 whitespace-pre-wrap max-h-40 overflow-auto">
                {JSON.stringify(input, null, 2)}
              </pre>
            )}
          </div>
        </div>
      );
    }

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
