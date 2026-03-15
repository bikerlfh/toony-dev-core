import api from "@/lib/api";
import type { PaginatedResponse, NotificationItem } from "@/types";

export async function listNotifications(params?: {
  cursor?: string;
  is_read?: boolean;
  organization_id?: string;
}): Promise<PaginatedResponse<NotificationItem>> {
  const query: Record<string, string> = {};
  if (params?.cursor) query.cursor = params.cursor;
  if (params?.is_read !== undefined) query.is_read = String(params.is_read);
  if (params?.organization_id) query.organization_id = params.organization_id;
  const { data } = await api.get<PaginatedResponse<NotificationItem>>("/notifications/", { params: query });
  return data;
}

export async function markRead(ids: string[]): Promise<{ updated: number }> {
  const { data } = await api.post<{ updated: number }>("/notifications/mark-read/", { ids });
  return data;
}

export async function markAllRead(organizationId?: string): Promise<{ updated: number }> {
  const body: Record<string, string> = {};
  if (organizationId) body.organization_id = organizationId;
  const { data } = await api.post<{ updated: number }>("/notifications/mark-all-read/", body);
  return data;
}

export async function deleteNotifications(ids: string[]): Promise<{ deleted: number }> {
  const { data } = await api.post<{ deleted: number }>("/notifications/delete/", { ids });
  return data;
}

export async function deleteAllNotifications(): Promise<{ deleted: number }> {
  const { data } = await api.post<{ deleted: number }>("/notifications/delete-all/");
  return data;
}

export async function getUnreadCount(): Promise<number> {
  const { data } = await api.get<{ count: number }>("/notifications/unread-count/");
  return data.count;
}
