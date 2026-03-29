"use client";

import { useState, KeyboardEvent } from "react";
import MentionAutoComplete from "@/components/ui/mention-autocomplete";

interface TaskInputBoxProps {
  onSend: (text: string) => void;
  disabled: boolean;
  placeholder?: string;
  projectId: string | null;
}

export function TaskInputBox({ onSend, disabled, placeholder, projectId }: TaskInputBoxProps) {
  const [text, setText] = useState("");

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="flex items-center gap-2 border-t border-slate-800 bg-slate-900 px-4 py-3">
      <MentionAutoComplete
        projectId={disabled ? null : projectId}
        value={text}
        onChange={setText}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? "Task is not active" : placeholder ?? "Send a message..."}
        rows={1}
        autoResize
        maxRows={5}
        wrapperClassName="flex-1 min-w-0"
        className="block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed resize-none"
      />
      <button
        onClick={handleSubmit}
        disabled={disabled || !text.trim()}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Send
      </button>
    </div>
  );
}
