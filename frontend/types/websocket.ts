import type { IssueList, IssueComment } from "./projects";

// --- Project WebSocket Events ---

export interface IssueCreatedEvent {
  type: "issue.created";
  data: IssueList;
}

export interface IssueUpdatedEvent {
  type: "issue.updated";
  data: IssueList;
}

export interface IssueDeletedEvent {
  type: "issue.deleted";
  data: { id: string };
}

export interface CommentCreatedEvent {
  type: "comment.created";
  data: { issue_id: string; comment: IssueComment };
}

export interface CommentUpdatedEvent {
  type: "comment.updated";
  data: { issue_id: string; comment: IssueComment };
}

export interface CommentDeletedEvent {
  type: "comment.deleted";
  data: { issue_id: string; comment_id: string };
}

export type ProjectWsEvent =
  | IssueCreatedEvent
  | IssueUpdatedEvent
  | IssueDeletedEvent
  | CommentCreatedEvent
  | CommentUpdatedEvent
  | CommentDeletedEvent;

// --- SubAgent WebSocket Events ---

export interface TaskAssignEvent {
  type: "task.assign";
  data: { task_id: string; skill_slug: string; input: Record<string, unknown> };
}

export interface HeartbeatAckEvent {
  type: "heartbeat.ack";
}

export type SubAgentWsEvent = TaskAssignEvent | HeartbeatAckEvent;

// --- WebSocket State ---

export type WsReadyState = 0 | 1 | 2 | 3; // CONNECTING | OPEN | CLOSING | CLOSED

// --- Notification WebSocket Events ---

export interface NotificationCreatedEvent {
  type: "notification.created";
  data: import("./notifications").NotificationItem;
}
