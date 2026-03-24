"use client";

import { useEffect, useMemo, useState } from "react";
import { AVATAR_STYLES, generateAvatarDataUri } from "./user-avatar";

interface AvatarStyleModalProps {
  userId: string;
  firstName?: string;
  email?: string;
  currentStyle: string;
  isSaving?: boolean;
  onSave: (style: string) => void;
  onClose: () => void;
}

export function AvatarStyleModal({
  userId,
  firstName,
  email,
  currentStyle,
  isSaving = false,
  onSave,
  onClose,
}: AvatarStyleModalProps) {
  const [selected, setSelected] = useState(currentStyle);

  const previews = useMemo(() => {
    return Object.entries(AVATAR_STYLES).map(([key, { label }]) => ({
      key,
      label,
      dataUri: generateAvatarDataUri(userId, key),
    }));
  }, [userId]);

  const heroDataUri = useMemo(() => {
    if (!selected) return "";
    return generateAvatarDataUri(userId, selected);
  }, [userId, selected]);

  const initials = (firstName?.[0] || email?.[0] || "?").toUpperCase();
  const hasChanged = selected !== currentStyle;

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-xl border border-slate-800/60 bg-slate-900 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium tracking-tight text-white">Choose your avatar</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Hero preview */}
        <div className="mt-5 flex justify-center">
          {heroDataUri ? (
            <img
              src={heroDataUri}
              alt=""
              width={96}
              height={96}
              className="h-24 w-24 rounded-full"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-800 text-3xl font-semibold text-slate-400">
              {initials}
            </div>
          )}
        </div>

        {/* Style grid */}
        <div className="mt-5 grid grid-cols-3 gap-2">
          {/* Initials option */}
          <button
            type="button"
            onClick={() => setSelected("")}
            className={`group flex flex-col items-center gap-1.5 rounded-lg border py-3 transition-all ${
              !selected
                ? "border-indigo-500/60 bg-indigo-500/8"
                : "border-slate-800/60 hover:border-slate-700"
            }`}
          >
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold transition-transform group-hover:scale-105 ${
                !selected ? "bg-indigo-500/15 text-indigo-400" : "bg-slate-800 text-slate-400"
              }`}
            >
              {initials}
            </div>
            <span className={`text-[11px] ${!selected ? "text-indigo-400" : "text-slate-600"}`}>
              Initials
            </span>
          </button>

          {previews.map(({ key, label, dataUri }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(key)}
              className={`group flex flex-col items-center gap-1.5 rounded-lg border py-3 transition-all ${
                selected === key
                  ? "border-indigo-500/60 bg-indigo-500/8"
                  : "border-slate-800/60 hover:border-slate-700"
              }`}
            >
              <img
                src={dataUri}
                alt={label}
                width={44}
                height={44}
                className="h-11 w-11 rounded-full transition-transform group-hover:scale-105"
              />
              <span className={`text-[11px] ${selected === key ? "text-indigo-400" : "text-slate-600"}`}>
                {label}
              </span>
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(selected)}
            disabled={!hasChanged || isSaving}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
