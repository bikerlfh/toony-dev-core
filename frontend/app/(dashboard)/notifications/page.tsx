"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/contexts/notification-context";
import * as notificationsApi from "@/lib/api/notifications";
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
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

type Filter = "all" | "unread";

export default function NotificationsPage() {
  const router = useRouter();
  const { markAsRead, markAllAsRead, refreshNotifications } = useNotifications();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetchNotifications = useCallback(
    async (cursor?: string) => {
      try {
        const params: { cursor?: string; is_read?: boolean } = {};
        if (cursor) params.cursor = cursor;
        if (filter === "unread") params.is_read = false;
        const result = await notificationsApi.listNotifications(params);

        if (cursor) {
          setItems((prev) => [...prev, ...result.results]);
        } else {
          setItems(result.results);
        }

        // Extract cursor from next URL
        if (result.next) {
          try {
            const url = new URL(result.next, window.location.origin);
            setNextCursor(url.searchParams.get("cursor"));
          } catch {
            setNextCursor(null);
          }
        } else {
          setNextCursor(null);
        }
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [filter],
  );

  useEffect(() => {
    setIsLoading(true);
    setSelected(new Set());
    fetchNotifications();
  }, [fetchNotifications]);

  function handleLoadMore() {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    fetchNotifications(nextCursor);
  }

  async function handleMarkSelectedRead() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    await markAsRead(ids);
    setItems((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, is_read: true } : n)),
    );
    setSelected(new Set());
  }

  async function handleMarkAllRead() {
    await markAllAsRead();
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setSelected(new Set());
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleItemClick(notification: NotificationItem) {
    if (!notification.is_read) {
      markAsRead([notification.id]);
      setItems((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n)),
      );
    }
    refreshNotifications();
    router.push(getNotificationUrl(notification));
  }

  const unreadSelected = Array.from(selected).filter((id) => {
    const n = items.find((item) => item.id === id);
    return n && !n.is_read;
  });

  if (isLoading) {
    return <p className="text-slate-500">Loading notifications...</p>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium tracking-tight text-white">
          Notifications
        </h1>
        <div className="flex items-center gap-3">
          {unreadSelected.length > 0 && (
            <button
              onClick={handleMarkSelectedRead}
              className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white"
            >
              Mark {unreadSelected.length} as read
            </button>
          )}
          <button
            onClick={handleMarkAllRead}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            Mark all as read
          </button>
        </div>
      </div>

      {/* Filter pills */}
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            filter === "all"
              ? "bg-slate-800 text-white"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter("unread")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            filter === "unread"
              ? "bg-slate-800 text-white"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          Unread
        </button>
      </div>

      {/* Notification list */}
      <div className="mt-6">
        {items.length === 0 ? (
          <p className="text-slate-500">
            {filter === "unread"
              ? "No unread notifications."
              : "No notifications."}
          </p>
        ) : (
          <div className="divide-y divide-slate-800/60 rounded-lg border border-slate-800/60">
            {items.map((n) => (
              <div
                key={n.id}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-900/40"
              >
                {/* Checkbox */}
                <label className="mt-1 flex items-center">
                  <input
                    type="checkbox"
                    checked={selected.has(n.id)}
                    onChange={() => toggleSelect(n.id)}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0"
                  />
                </label>

                {/* Clickable area */}
                <button
                  onClick={() => handleItemClick(n)}
                  className="flex min-w-0 flex-1 items-start gap-3 text-left"
                >
                  {/* Actor avatar */}
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-medium text-slate-400">
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
              </div>
            ))}
          </div>
        )}

        {/* Load more */}
        {nextCursor && (
          <div className="mt-4 flex justify-center">
            <button
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="rounded-lg border border-slate-700 bg-slate-900/50 px-6 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white disabled:opacity-50"
            >
              {isLoadingMore ? "Loading..." : "Load more"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
