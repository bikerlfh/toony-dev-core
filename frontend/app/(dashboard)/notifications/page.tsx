"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/contexts/notification-context";
import * as notificationsApi from "@/lib/api/notifications";
import { timeAgo } from "@/lib/time";
import { UserAvatar } from "@/components/ui/user-avatar";
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

const EVENT_ICONS: Record<string, { icon: string; color: string }> = {
  "issue.assigned": { icon: "U", color: "bg-indigo-500/15 text-indigo-400" },
  "issue.status_changed": { icon: "S", color: "bg-amber-500/15 text-amber-400" },
  "comment.created": { icon: "C", color: "bg-sky-500/15 text-sky-400" },
  "comment.mentioned": { icon: "@", color: "bg-violet-500/15 text-violet-400" },
  "project.member_added": { icon: "+", color: "bg-emerald-500/15 text-emerald-400" },
  "project.member_removed": { icon: "-", color: "bg-red-500/15 text-red-400" },
  "agent_task.completed": { icon: "\u2713", color: "bg-emerald-500/15 text-emerald-400" },
  "agent_task.failed": { icon: "!", color: "bg-red-500/15 text-red-400" },
  "artifact.created": { icon: "A", color: "bg-cyan-500/15 text-cyan-400" },
  "agent.connected": { icon: "\u25CF", color: "bg-emerald-500/15 text-emerald-400" },
  "agent.disconnected": { icon: "\u25CF", color: "bg-slate-500/15 text-slate-400" },
};

function getEventVisual(eventType: string) {
  return EVENT_ICONS[eventType] || { icon: "\u2022", color: "bg-slate-500/15 text-slate-400" };
}

type Filter = "all" | "unread";

export default function NotificationsPage() {
  const router = useRouter();
  const { markAsRead, markAllAsRead, deleteNotifications, deleteAllNotifications, refreshNotifications } = useNotifications();
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

  async function handleDeleteSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    await deleteNotifications(ids);
    setItems((prev) => prev.filter((n) => !ids.includes(n.id)));
    setSelected(new Set());
  }

  async function handleDeleteAll() {
    await deleteAllNotifications();
    setItems([]);
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

  const unreadCount = items.filter((n) => !n.is_read).length;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-medium tracking-tight text-white">
            Notifications
          </h1>
          {unreadCount > 0 && (
            <span className="rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-xs font-medium text-indigo-400">
              {unreadCount} unread
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <>
              {unreadSelected.length > 0 && (
                <button
                  onClick={handleMarkSelectedRead}
                  className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white"
                >
                  Mark {unreadSelected.length} as read
                </button>
              )}
              <button
                onClick={handleDeleteSelected}
                className="rounded-lg border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 transition-all hover:bg-red-500/10"
              >
                Delete {selected.size}
              </button>
            </>
          )}
          {selected.size === 0 && (
            <>
              <button
                onClick={handleMarkAllRead}
                className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:text-white"
              >
                Mark all as read
              </button>
              <button
                onClick={handleDeleteAll}
                className="rounded-lg border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 transition-all hover:bg-red-500/10"
              >
                Delete all
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="mt-5 flex items-center gap-1 border-b border-slate-800/60">
        {(["all", "unread"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
              filter === f
                ? "text-white"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {f === "all" ? "All" : "Unread"}
            {filter === f && (
              <span className="absolute inset-x-0 -bottom-px h-px bg-indigo-500" />
            )}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="mt-0">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-1 w-6 animate-pulse rounded-full bg-slate-700"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <div className="font-mono text-sm text-slate-500">
              <span className="text-indigo-500">~</span>
              <span className="text-slate-600">/</span>
              <span>
                {filter === "unread" ? "no unread notifications" : "no notifications"}
              </span>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/40">
            {items.map((n) => {
              const visual = getEventVisual(n.event_type);
              return (
                <div
                  key={n.id}
                  className={`group flex items-start gap-3 py-3.5 transition-colors ${
                    !n.is_read ? "bg-indigo-500/[0.03]" : ""
                  }`}
                >
                  {/* Checkbox */}
                  <label className="mt-0.5 flex shrink-0 items-center">
                    <input
                      type="checkbox"
                      checked={selected.has(n.id)}
                      onChange={() => toggleSelect(n.id)}
                      className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0"
                    />
                  </label>

                  {/* Event icon */}
                  {n.actor ? (
                    <UserAvatar
                      userId={n.actor.id}
                      firstName={n.actor.first_name}
                      lastName={n.actor.last_name}
                      email={n.actor.email}
                      avatarStyle={n.actor.avatar_style}
                      size={28}
                    />
                  ) : (
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-medium ${visual.color}`}>
                      {visual.icon}
                    </div>
                  )}

                  {/* Content — clickable */}
                  <button
                    onClick={() => handleItemClick(n)}
                    className="flex min-w-0 flex-1 items-start justify-between gap-4 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm leading-snug ${!n.is_read ? "font-medium text-slate-200" : "text-slate-400"}`}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-slate-600">
                          {n.body}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5 pt-0.5">
                      <span className="text-xs text-slate-600">
                        {timeAgo(n.created_at)}
                      </span>
                      {!n.is_read && (
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                      )}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Load more */}
        {nextCursor && (
          <div className="flex justify-center border-t border-slate-800/40 py-4">
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
