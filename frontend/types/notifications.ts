import type { User } from "./auth";

export interface NotificationItem {
  id: string;
  event_type: string;
  actor: User | null;
  title: string;
  body: string;
  target_type: string;
  target_id: string;
  metadata: Record<string, string>;
  is_read: boolean;
  read_at: string | null;
  organization: string;
  created_at: string;
}
