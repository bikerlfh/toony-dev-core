"use client";

import { useState, useRef, useEffect } from "react";

interface PillOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  color?: string;
}

interface PillDropdownProps {
  label: string;
  icon?: React.ReactNode;
  options: PillOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  /** When true, allows selecting multiple values. Use `selectedValues`/`onChangeMulti` instead. */
  multi?: boolean;
  selectedValues?: string[];
  onChangeMulti?: (values: string[]) => void;
  /** Custom render for the pill button content in multi-select mode. */
  renderLabel?: (selectedValues: string[], options: PillOption[]) => React.ReactNode;
}

export function PillDropdown({
  label,
  icon,
  options,
  value,
  onChange,
  disabled = false,
  multi = false,
  selectedValues = [],
  onChangeMulti,
  renderLabel,
}: PillDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const selectedOption = options.find((o) => o.value === value);
  const displayContent = multi
    ? renderLabel
      ? renderLabel(selectedValues, options)
      : selectedValues.length > 0
        ? `${label} (${selectedValues.length})`
        : label
    : selectedOption
      ? selectedOption.label
      : label;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
          disabled
            ? "cursor-not-allowed border-slate-800 text-slate-600"
            : open
              ? "border-slate-600 bg-slate-700 text-slate-200"
              : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-200"
        }`}
      >
        {icon && <span className="text-sm leading-none">{icon}</span>}
        {displayContent}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[180px] max-h-[240px] overflow-y-auto rounded-lg border border-slate-700 bg-slate-800 py-1 shadow-xl">
          {options.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-500">No options</div>
          )}
          {options.map((opt) => {
            const isSelected = multi
              ? selectedValues.includes(opt.value)
              : value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                  isSelected
                    ? "bg-slate-700 text-white"
                    : "text-slate-300 hover:bg-slate-700/60 hover:text-slate-200"
                }`}
                onClick={() => {
                  if (multi && onChangeMulti) {
                    onChangeMulti(
                      isSelected
                        ? selectedValues.filter((v) => v !== opt.value)
                        : [...selectedValues, opt.value]
                    );
                  } else {
                    onChange(isSelected ? null : opt.value);
                    setOpen(false);
                  }
                }}
              >
                {opt.color && (
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: opt.color }}
                  />
                )}
                {opt.icon && <span className="text-sm leading-none">{opt.icon}</span>}
                {opt.label}
                {isSelected && !opt.color && (
                  <svg className="ml-auto h-3.5 w-3.5 shrink-0 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
