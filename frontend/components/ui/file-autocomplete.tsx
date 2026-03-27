"use client";

import { useEffect, useRef, useState, useCallback, KeyboardEvent, ChangeEvent } from "react";
import api from "@/lib/api";
import { fuzzyPathMatch } from "@/lib/fuzzy-path-filter";

interface FileAutoCompleteProps {
  projectId: string | null;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
}

interface MentionState {
  active: boolean;
  startIndex: number;
  query: string;
  position: { top: number; left: number };
}

export default function FileAutoComplete({
  projectId,
  value,
  onChange,
  placeholder,
  rows = 3,
  className = "",
  onKeyDown: externalOnKeyDown,
}: FileAutoCompleteProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [fileTree, setFileTree] = useState<string[]>([]);
  const [mention, setMention] = useState<MentionState>({
    active: false,
    startIndex: 0,
    query: "",
    position: { top: 0, left: 0 },
  });
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Fetch file tree when projectId changes
  useEffect(() => {
    if (!projectId) {
      setFileTree([]);
      return;
    }
    let cancelled = false;
    api
      .get(`/projects/${projectId}/file-tree/`)
      .then((res) => {
        if (!cancelled) setFileTree(res.data.tree || []);
      })
      .catch(() => {
        if (!cancelled) setFileTree([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Filter files using fuzzy path-segment matching.
  const filtered = mention.active
    ? fileTree
        .filter((f) => fuzzyPathMatch(f, mention.query))
        .slice(0, 20)
    : [];

  // Calculate cursor position using mirror div
  const getCursorPosition = useCallback(() => {
    const textarea = textareaRef.current;
    const mirror = mirrorRef.current;
    if (!textarea || !mirror) return { top: 0, left: 0 };

    // Copy styles from textarea to mirror
    const computed = window.getComputedStyle(textarea);
    const stylesToCopy = [
      "fontFamily",
      "fontSize",
      "fontWeight",
      "lineHeight",
      "letterSpacing",
      "wordSpacing",
      "textIndent",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "borderTopWidth",
      "borderRightWidth",
      "borderBottomWidth",
      "borderLeftWidth",
      "boxSizing",
    ] as const;
    stylesToCopy.forEach((prop) => {
      (mirror.style as any)[prop] = computed[prop];
    });
    mirror.style.width = `${textarea.offsetWidth}px`;
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.wordWrap = "break-word";
    mirror.style.overflow = "hidden";

    // Insert text up to cursor with a span marker
    const textBeforeCursor = textarea.value.substring(0, textarea.selectionStart);
    mirror.innerHTML = "";
    const textNode = document.createTextNode(textBeforeCursor);
    const marker = document.createElement("span");
    marker.textContent = "\u200b"; // zero-width space
    mirror.appendChild(textNode);
    mirror.appendChild(marker);

    const markerRect = marker.getBoundingClientRect();
    const textareaRect = textarea.getBoundingClientRect();

    return {
      top: markerRect.top - textareaRect.top + textarea.scrollTop + 20,
      left: markerRect.left - textareaRect.left,
    };
  }, []);

  // Detect "@" trigger on input change
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = newValue.substring(0, cursorPos);

    // Find the last "@" before cursor that isn't preceded by a non-space char
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex === -1 || fileTree.length === 0) {
      setMention((prev) => ({ ...prev, active: false }));
      return;
    }

    // "@" must be at start or preceded by whitespace
    if (lastAtIndex > 0 && !/\s/.test(textBeforeCursor[lastAtIndex - 1])) {
      setMention((prev) => ({ ...prev, active: false }));
      return;
    }

    const query = textBeforeCursor.substring(lastAtIndex + 1);

    // Close if there's a space in the query (user moved on)
    if (query.includes(" ")) {
      setMention((prev) => ({ ...prev, active: false }));
      return;
    }

    const position = getCursorPosition();
    setMention({ active: true, startIndex: lastAtIndex, query, position });
    setSelectedIndex(0);
  };

  // Select a file from the dropdown
  const selectFile = useCallback(
    (filePath: string) => {
      const before = value.substring(0, mention.startIndex);
      const after = value.substring(mention.startIndex + 1 + mention.query.length);
      const newValue = `${before}@${filePath}${after}`;
      onChange(newValue);
      setMention((prev) => ({ ...prev, active: false }));

      // Restore cursor position after the inserted path
      const newCursorPos = mention.startIndex + 1 + filePath.length;
      requestAnimationFrame(() => {
        textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
        textareaRef.current?.focus();
      });
    },
    [value, mention.startIndex, mention.query, onChange]
  );

  // Keyboard navigation
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention.active && filtered.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filtered.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectFile(filtered[selectedIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention((prev) => ({ ...prev, active: false }));
        return;
      }
    }
    externalOnKeyDown?.(e);
  };

  // Close dropdown on outside click
  useEffect(() => {
    if (!mention.active) return;
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setMention((prev) => ({ ...prev, active: false }));
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [mention.active]);

  // Scroll selected item into view
  useEffect(() => {
    if (!mention.active || !dropdownRef.current) return;
    const items = dropdownRef.current.querySelectorAll("[data-file-item]");
    items[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, mention.active]);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={className}
      />
      {/* Hidden mirror div for cursor position calculation */}
      <div
        ref={mirrorRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute top-0 left-0"
      />
      {/* Dropdown */}
      {mention.active && filtered.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 max-h-48 w-max max-w-lg overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 shadow-xl"
          style={{ top: mention.position.top, left: mention.position.left }}
        >
          {filtered.map((file, i) => (
            <button
              key={file}
              data-file-item
              type="button"
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                i === selectedIndex
                  ? "bg-indigo-600/30 text-indigo-300"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                selectFile(file);
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <svg
                className="h-4 w-4 shrink-0 text-slate-500"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                />
              </svg>
              <span>{file}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
