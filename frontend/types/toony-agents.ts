export type ToonyAgentStatus = "OFFLINE" | "ONLINE" | "BUSY";
export type AgentTaskStatus =
  | "QUEUED"
  | "ASSIGNED"
  | "RUNNING"
  | "AWAITING_APPROVAL"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";
export type TaskEventType =
  | "LOG"
  | "TOOL_USE"
  | "TOOL_RESULT"
  | "APPROVAL_NEEDED"
  | "APPROVAL_RESPONSE"
  | "REPLY"
  | "STATUS_CHANGE"
  | "ERROR";

export interface ToonyAgentList {
  id: string;
  name: string;
  slug: string;
  status: ToonyAgentStatus;
  last_heartbeat: string | null;
  last_connected_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ToonyAgentDetail extends ToonyAgentList {
  registered_by: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
  };
  organizations: {
    id: string;
    name: string;
    slug: string;
  }[];
  updated_at: string;
}

export interface CreateToonyAgentPayload {
  name: string;
  slug: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateToonyAgentPayload {
  name?: string;
  metadata?: Record<string, unknown>;
  organization_ids?: string[];
}

export interface ToonyAgentKeyItem {
  id: string;
  key_prefix: string;
  name: string;
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
  raw_key?: string; // Only on creation response
}

export interface AgentTaskList {
  id: string;
  title: string;
  status: AgentTaskStatus;
  toony_agent_slug: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface AgentTaskDetail extends AgentTaskList {
  prompt: string;
  result: string | null;
  error: string | null;
  session_id: string | null;
  created_by: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
  };
  updated_at: string;
}

export interface CreateAgentTaskPayload {
  title: string;
  prompt: string;
}

export interface TaskEventItem {
  id: string;
  event_type: TaskEventType;
  data: Record<string, unknown>;
  sequence: number;
  created_at: string;
}

// WebSocket event types
export interface ToonyAgentStatusWsEvent {
  type: "agent.status";
  status: ToonyAgentStatus;
  metadata?: Record<string, unknown>;
}

export interface TaskStatusWsEvent {
  type: "task.status";
  task_id: string;
  status: AgentTaskStatus;
  error?: string;
  session_id?: string | null;
}

export interface TaskEventWsEvent {
  type: "task.event";
  task_id: string;
  event_type: TaskEventType;
  data: Record<string, unknown>;
  sequence: number;
}

export interface ApprovalNeededWsEvent {
  type: "approval.needed";
  task_id: string;
  data: {
    stage?: string;
    question: string;
    options?: { label: string; description: string }[];
  };
  sequence: number;
}

export type ToonyAgentWsEvent =
  | ToonyAgentStatusWsEvent
  | TaskStatusWsEvent
  | TaskEventWsEvent
  | ApprovalNeededWsEvent;
