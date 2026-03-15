"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

export function NotificationToast({
  notification,
  onDismiss,
}: {
  notification: NotificationItem;
  onDismiss: () => void;
}) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 200);
    }, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <button
      onClick={() => {
        router.push(getNotificationUrl(notification));
        onDismiss();
      }}
      className={`w-80 rounded-lg border border-slate-700 bg-slate-800 p-4 shadow-xl transition-all duration-200 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-xs text-indigo-400">
          {notification.actor
            ? notification.actor.first_name?.[0]?.toUpperCase() || "?"
            : "?"}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className="text-sm font-medium leading-snug text-white">
            {notification.title}
          </p>
          {notification.body && (
            <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">
              {notification.body}
            </p>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setVisible(false);
            setTimeout(onDismiss, 200);
          }}
          className="shrink-0 text-slate-500 hover:text-slate-300"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </button>
  );
}
