"use client";

import { useState, useRef, useEffect, useCallback, useId } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  size?: "sm" | "default";
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

export function Select({
  options,
  value,
  onChange,
  placeholder = "Select...",
  size = "default",
  disabled = false,
  required = false,
  className = "",
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();
  const triggerId = `${id}-trigger`;
  const listboxId = `${id}-listbox`;

  const selectedOption = options.find((o) => o.value === value);

  const close = useCallback(() => {
    setOpen(false);
    setFocusedIndex(-1);
  }, []);

  // close on outside click
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

  // scroll focused option into view
  useEffect(() => {
    if (!open || focusedIndex < 0 || !listRef.current) return;
    const item = listRef.current.children[focusedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex, open]);

  const handleSelect = useCallback(
    (v: string) => {
      onChange(v);
      close();
    },
    [onChange, close],
  );

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "Enter":
      case " ":
      case "ArrowDown":
        e.preventDefault();
        setOpen(true);
        setFocusedIndex(
          options.findIndex((o) => o.value === value),
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setOpen(true);
        setFocusedIndex(
          options.findIndex((o) => o.value === value),
        );
        break;
    }
  };

  const handleListKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setFocusedIndex((i) => (i < options.length - 1 ? i + 1 : i));
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusedIndex((i) => (i > 0 ? i - 1 : i));
        break;
      case "Enter":
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < options.length) {
          handleSelect(options[focusedIndex].value);
        }
        break;
      case "Escape":
        e.preventDefault();
        close();
        containerRef.current
          ?.querySelector<HTMLButtonElement>(`#${CSS.escape(triggerId)}`)
          ?.focus();
        break;
      case "Tab":
        close();
        break;
    }
  };

  // focus the listbox when it opens
  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.focus();
    }
  }, [open]);

  const sizeClasses =
    size === "sm"
      ? "px-1.5 py-0.5 text-xs"
      : "px-3 py-2 text-sm";

  const isInvalid = required && !value;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        id={triggerId}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setOpen(!open);
            if (!open) {
              setFocusedIndex(options.findIndex((o) => o.value === value));
            }
          }
        }}
        onKeyDown={handleTriggerKeyDown}
        {...(isInvalid ? { "data-select-invalid": "" } : {})}
        className={`flex w-full items-center justify-between rounded-md border border-slate-700 bg-slate-950 ${sizeClasses} text-left transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none ${
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
        } ${selectedOption ? "text-slate-200" : "text-slate-500"}`}
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        {/* Chevron */}
        <svg
          className={`ml-2 h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Hidden native select for form validation */}
      {required && (
        <select
          tabIndex={-1}
          aria-hidden="true"
          required
          value={value}
          onChange={() => {}}
          className="absolute inset-0 h-full w-full opacity-0 pointer-events-none"
        >
          <option value="" />
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}

      {/* Dropdown */}
      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={
            focusedIndex >= 0 ? `${id}-option-${focusedIndex}` : undefined
          }
          onKeyDown={handleListKeyDown}
          className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-700 bg-slate-800 py-1 shadow-lg focus:outline-none animate-[selectDropdown_150ms_ease-out]"
        >
          {options.map((option, idx) => {
            const isSelected = option.value === value;
            const isFocused = idx === focusedIndex;
            return (
              <li
                key={option.value}
                id={`${id}-option-${idx}`}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setFocusedIndex(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(option.value);
                }}
                className={`flex cursor-pointer items-center justify-between ${
                  size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-3 py-1.5 text-sm"
                } ${
                  isFocused
                    ? "bg-slate-700/50 text-white"
                    : isSelected
                      ? "text-white"
                      : "text-slate-300"
                }`}
              >
                <span className="truncate">{option.label}</span>
                {isSelected && (
                  <svg
                    className="ml-2 h-4 w-4 shrink-0 text-indigo-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
