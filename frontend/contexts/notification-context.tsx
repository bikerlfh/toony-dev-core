"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { showToast } from "nextjs-toast-notify";
import { useAuth } from "@/contexts/auth-context";
import { useNotificationWebSocket } from "@/hooks/use-notification-websocket";
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

    showToast.info(notification.title, {
      duration: 4000,
      progress: true,
      position: "top-right",
      transition: "bounceIn",
      sound: false,
    });
  }, []);

  useNotificationWebSocket({
    enabled: isAuthenticated,
    onNotification: handleNewNotification,
  });

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
