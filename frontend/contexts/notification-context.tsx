"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@/contexts/auth-context";
import { useNotificationWebSocket } from "@/hooks/use-notification-websocket";
import { NotificationToast } from "@/components/notification-toast";
import type { NotificationItem } from "@/types";
import * as notificationsApi from "@/lib/api/notifications";

const MAX_DROPDOWN_ITEMS = 15;

interface NotificationContextValue {
  unreadCount: number;
  notifications: NotificationItem[];
  markAsRead: (ids: string[]) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toasts, setToasts] = useState<NotificationItem[]>([]);

  const fetchInitial = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const [countResult, listResult] = await Promise.all([
        notificationsApi.getUnreadCount(),
        notificationsApi.listNotifications(),
      ]);
      setUnreadCount(countResult);
      setNotifications(listResult.results.slice(0, MAX_DROPDOWN_ITEMS));
    } catch {
      // silently fail
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  const handleNewNotification = useCallback((notification: NotificationItem) => {
    setNotifications((prev) => [notification, ...prev].slice(0, MAX_DROPDOWN_ITEMS));
    setUnreadCount((prev) => prev + 1);
    setToasts((prev) => [...prev, notification]);
  }, []);

  useNotificationWebSocket({
    enabled: isAuthenticated,
    onNotification: handleNewNotification,
  });

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const markAsRead = useCallback(async (ids: string[]) => {
    await notificationsApi.markRead(ids);
    setNotifications((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, is_read: true } : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev - ids.length));
  }, []);

  const markAllAsRead = useCallback(async () => {
    await notificationsApi.markAllRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, []);

  const value = useMemo<NotificationContextValue>(
    () => ({
      unreadCount,
      notifications,
      markAsRead,
      markAllAsRead,
      refreshNotifications: fetchInitial,
    }),
    [unreadCount, notifications, markAsRead, markAllAsRead, fetchInitial],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <NotificationToast
            key={t.id}
            notification={t}
            onDismiss={() => dismissToast(t.id)}
          />
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}
