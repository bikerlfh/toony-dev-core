"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const EMOJI_SECTIONS: { label: string; emojis: string[] }[] = [
  {
    label: "Tech",
    emojis: [
      "💻", "🖥️", "⚙️", "🔧", "🛠️", "🔌", "💡", "🔬",
      "🧪", "🤖", "🧠", "📡", "🔒", "🛡️", "📱", "🎮",
    ],
  },
  {
    label: "Work",
    emojis: [
      "📁", "📋", "📊", "📈", "📝", "📌", "🗂️", "📑",
      "🎯", "🏆", "📅", "🗓️", "✅", "📣", "💬", "📧",
    ],
  },
  {
    label: "Symbols",
    emojis: [
      "🚀", "⚡", "🔥", "✨", "💎", "⭐", "💫", "🔷",
      "🔶", "❤️", "💜", "💙", "💚", "🧡", "♾️", "🏴",
    ],
  },
  {
    label: "Nature",
    emojis: [
      "🌱", "🌿", "🌊", "🌸", "🌻", "🌈", "🌍", "🌙",
      "☀️", "🍃", "🐛", "🦊", "🐝", "🦋", "🐬", "🦅",
    ],
  },
  {
    label: "Creative",
    emojis: [
      "🎨", "🎵", "📸", "🎬", "🧩", "🎭", "🎲", "🎪",
      "☕", "🍕", "📚", "✏️", "🖊️", "🪄", "💼", "🏗️",
    ],
  },
];

const PRESET_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#ec4899", // pink
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#6b7280", // gray
];

interface ProjectIconPickerProps {
  icon: string;
  color: string;
  onIconChange: (icon: string) => void;
  onColorChange: (color: string) => void;
}

export function ProjectIconPicker({
  icon,
  color,
  onIconChange,
  onColorChange,
}: ProjectIconPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        close();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, close]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 text-base transition-colors hover:border-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        style={{
          backgroundColor: color ? `${color}18` : "rgb(30 41 59 / 0.6)",
          color: color || "rgb(148 163 184)",
        }}
      >
        {icon || (
          <svg
            className="h-4 w-4 text-slate-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-2 w-[296px] rounded-lg border border-slate-800 bg-slate-900 p-3 shadow-xl animate-[selectDropdown_150ms_ease-out]">
          {/* Emoji sections */}
          <div className="max-h-[216px] space-y-2.5 overflow-y-auto">
            {EMOJI_SECTIONS.map((section) => (
              <div key={section.label}>
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-600">
                  {section.label}
                </p>
                <div className="grid grid-cols-8 gap-0.5">
                  {section.emojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onIconChange(emoji);
                      }}
                      className={`flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors ${
                        icon === emoji
                          ? "bg-slate-700/80 ring-1 ring-indigo-500/50"
                          : "hover:bg-slate-800"
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="my-2.5 border-t border-slate-800/40" />

          {/* Color swatches */}
          <div>
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-600">
              Color
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    onColorChange(color === c ? "" : c);
                  }}
                  className={`h-5 w-5 rounded-full transition-transform ${
                    color === c
                      ? "ring-2 ring-white/40 ring-offset-1 ring-offset-slate-900 scale-110"
                      : "hover:scale-110"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
