"use client";

import { useState } from "react";

interface ApprovalOption {
  label: string;
  description: string;
}

interface ApprovalGateCardProps {
  question: string;
  options?: ApprovalOption[];
  onApprove: () => void;
  onReject: () => void;
  onMessage: (text: string) => void;
  isResolved: boolean;
}

export function ApprovalGateCard({
  question,
  options,
  onApprove,
  onReject,
  onMessage,
  isResolved,
}: ApprovalGateCardProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");

  function handleSendMessage() {
    const text = messageText.trim();
    if (!text) return;
    onMessage(text);
    setMessageText("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }

  const cardClass = isResolved
    ? "rounded-lg border-2 border-slate-700 bg-slate-900/50 p-4 opacity-60"
    : "rounded-lg border-2 border-amber-500/50 bg-amber-500/5 p-4";

  return (
    <div className={cardClass}>
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-amber-400 text-sm font-medium">
          Approval Required
        </span>
      </div>

      {/* Question */}
      <p className="text-sm text-slate-200 leading-relaxed">{question}</p>

      {/* Options */}
      {options && options.length > 0 && (
        <div className="mt-3 space-y-2">
          {options.map((opt) => (
            <label
              key={opt.label}
              className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                selectedOption === opt.label
                  ? "border-indigo-500 bg-indigo-500/10"
                  : "border-slate-700 bg-slate-950/50 hover:border-slate-600"
              } ${isResolved ? "pointer-events-none" : ""}`}
            >
              <input
                type="radio"
                name="approval-option"
                value={opt.label}
                checked={selectedOption === opt.label}
                onChange={() => setSelectedOption(opt.label)}
                disabled={isResolved}
                className="mt-0.5 accent-indigo-500"
              />
              <div>
                <span className="text-sm font-medium text-slate-200">
                  {opt.label}
                </span>
                <p className="text-xs text-slate-400 mt-0.5">
                  {opt.description}
                </p>
              </div>
            </label>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={onApprove}
          disabled={isResolved}
          className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Approve
        </button>
        <button
          onClick={onReject}
          disabled={isResolved}
          className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Reject
        </button>
      </div>

      {/* Message input */}
      {!isResolved && (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a custom response..."
            className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
          />
          <button
            onClick={handleSendMessage}
            disabled={!messageText.trim()}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
