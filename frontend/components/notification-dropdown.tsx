"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/contexts/notification-context";
import type { NotificationItem } from "@/types";

function getNotificationUrl(notification: NotificationItem): string {
  switch (notification.target_type) {
    case "issue":
      return `/projects/${notification.metadata.project_id}/issues/${notification.target_id}`;
    case "project":
      return `/projects/${notification.target_id}`;
    case "agent_task":
      return notification.metadata.issue_id
        ? `/projects/${notification.metadata.project_id}/issues/${notification.metadata.issue_id}`
        : "/tasks";
    case "artifact":
      return notification.metadata.issue_id
        ? `/projects/${notification.metadata.project_id}/issues/${notification.metadata.issue_id}`
        : "/artifacts";
    default:
      return "/notifications";
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function NotificationDropdown() {
  const router = useRouter();
  const { unreadCount, notifications, markAsRead, markAllAsRead } = useNotifications();
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

  function handleItemClick(notification: NotificationItem) {
    if (!notification.is_read) {
      markAsRead([notification.id]);
    }
    router.push(getNotificationUrl(notification));
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="relative flex items-center justify-center rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-900/60 hover:text-slate-300"
        title="Notificaciones"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-500 px-1 text-[10px] font-medium text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel — positioned above */}
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-80 rounded-lg border border-slate-800/60 bg-slate-900 shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800/60 px-4 py-3">
            <h3 className="text-sm font-medium text-white">Notificaciones</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllAsRead()}
                className="text-xs text-indigo-400 transition-colors hover:text-indigo-300"
              >
                Marcar todas como le&iacute;das
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-600">
                Sin notificaciones
              </p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-800/50"
                >
                  {/* Actor avatar */}
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-medium text-slate-400">
                    {n.actor
                      ? n.actor.first_name?.[0]?.toUpperCase() || "?"
                      : "?"}
                  </div>
                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug text-slate-300">
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-slate-600">
                        {n.body}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-600">
                      {timeAgo(n.created_at)}
                    </p>
                  </div>
                  {/* Unread dot */}
                  {!n.is_read && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-800/60 px-4 py-2">
            <button
              onClick={() => {
                router.push("/notifications");
                setOpen(false);
              }}
              className="w-full rounded-md py-1.5 text-center text-xs text-slate-400 transition-colors hover:text-slate-200"
            >
              Ver todas
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
