"use client";

import { useState } from "react";

interface QuestionOption {
  label: string;
  description?: string;
}

interface AgentQuestionCardProps {
  question: string;
  header?: string;
  options?: QuestionOption[];
  questionId: string;
  onAnswer: (questionId: string, answer: string) => void;
  isAnswered: boolean;
  previousAnswer?: string;
}

export function AgentQuestionCard({
  question,
  header,
  options,
  questionId,
  onAnswer,
  isAnswered,
  previousAnswer,
}: AgentQuestionCardProps) {
  const [answerText, setAnswerText] = useState("");

  function handleSend() {
    const text = answerText.trim();
    if (!text) return;
    onAnswer(questionId, text);
    setAnswerText("");
  }

  function handleOptionClick(label: string) {
    onAnswer(questionId, label);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const cardClass = isAnswered
    ? "rounded-lg border-2 border-slate-700 bg-slate-900/50 p-4 opacity-60"
    : "rounded-lg border-2 border-indigo-500/50 bg-indigo-500/5 p-4";

  return (
    <div className={cardClass}>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-indigo-400 text-sm font-medium">
          {header ?? "Agent Question"}
        </span>
      </div>

      <p className="text-sm text-slate-200 leading-relaxed">{question}</p>

      {isAnswered && previousAnswer && (
        <div className="mt-2 rounded-md bg-slate-800/50 px-3 py-2">
          <span className="text-xs text-slate-500">Your answer: </span>
          <span className="text-sm text-slate-300">{previousAnswer}</span>
        </div>
      )}

      {!isAnswered && options && options.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {options.map((opt) => (
            <button
              key={opt.label}
              onClick={() => handleOptionClick(opt.label)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-left transition-colors hover:border-indigo-500/50 hover:bg-indigo-500/10"
            >
              <span className="block text-sm font-medium text-slate-200">
                {opt.label}
              </span>
              {opt.description && (
                <span className="block text-xs text-slate-500 mt-0.5">
                  {opt.description}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {!isAnswered && (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your answer..."
            className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={!answerText.trim()}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
