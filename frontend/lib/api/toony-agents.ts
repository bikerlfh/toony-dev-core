import api from "@/lib/api";
import type {
  ToonyAgentList,
  ToonyAgentDetail,
  CreateToonyAgentPayload,
  UpdateToonyAgentPayload,
  ToonyAgentKeyItem,
  AgentTaskList,
  AgentTaskDetail,
  AgentTaskByIssueItem,
  CreateAgentTaskPayload,
  TaskEventItem,
  AgentSystemEventItem,
  PaginatedResponse,
} from "@/types";

// ── ToonyAgent CRUD ──

export async function listToonyAgents(
  cursor?: string
): Promise<PaginatedResponse<ToonyAgentList>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<ToonyAgentList>>(
    `/toony-agents/`,
    { params }
  );
  return data;
}

export async function createToonyAgent(
  payload: CreateToonyAgentPayload
): Promise<ToonyAgentDetail> {
  const { data } = await api.post<ToonyAgentDetail>(
    `/toony-agents/`,
    payload
  );
  return data;
}

export async function getToonyAgent(
  agentId: string
): Promise<ToonyAgentDetail> {
  const { data } = await api.get<ToonyAgentDetail>(
    `/toony-agents/${agentId}/`
  );
  return data;
}

export async function updateToonyAgent(
  agentId: string,
  payload: UpdateToonyAgentPayload
): Promise<ToonyAgentDetail> {
  const { data } = await api.put<ToonyAgentDetail>(
    `/toony-agents/${agentId}/`,
    payload
  );
  return data;
}

export async function deleteToonyAgent(
  agentId: string
): Promise<void> {
  await api.delete(`/toony-agents/${agentId}/`);
}

export async function listToonyAgentsByOrganization(
  orgId: string
): Promise<PaginatedResponse<ToonyAgentList>> {
  const { data } = await api.get<PaginatedResponse<ToonyAgentList>>(
    `/toony-agents/`,
    { params: { organization: orgId } }
  );
  return data;
}

// ── API Keys ──

export async function listAgentKeys(
  agentId: string
): Promise<PaginatedResponse<ToonyAgentKeyItem>> {
  const { data } = await api.get<PaginatedResponse<ToonyAgentKeyItem>>(
    `/toony-agents/${agentId}/keys/`
  );
  return data;
}

export async function generateAgentKey(
  agentId: string,
  name: string
): Promise<ToonyAgentKeyItem> {
  const { data } = await api.post<ToonyAgentKeyItem>(
    `/toony-agents/${agentId}/keys/`,
    { name }
  );
  return data;
}

export async function revokeAgentKey(
  agentId: string,
  keyId: string
): Promise<void> {
  await api.delete(
    `/toony-agents/${agentId}/keys/${keyId}/`
  );
}

// ── Tasks by Issue ──

export async function listAgentTasksByIssue(
  issueId: string
): Promise<PaginatedResponse<AgentTaskByIssueItem>> {
  const { data } = await api.get<PaginatedResponse<AgentTaskByIssueItem>>(
    `/agent-tasks/`,
    { params: { issue_id: issueId } }
  );
  return data;
}

// ── Tasks ──

export async function listAgentTasks(
  agentId: string,
  cursor?: string
): Promise<PaginatedResponse<AgentTaskList>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<AgentTaskList>>(
    `/toony-agents/${agentId}/tasks/`,
    { params }
  );
  return data;
}

export async function createAgentTask(
  agentId: string,
  payload: CreateAgentTaskPayload
): Promise<AgentTaskDetail> {
  const { data } = await api.post<AgentTaskDetail>(
    `/toony-agents/${agentId}/tasks/`,
    payload
  );
  return data;
}

export async function getAgentTask(
  agentId: string,
  taskId: string
): Promise<AgentTaskDetail> {
  const { data } = await api.get<AgentTaskDetail>(
    `/toony-agents/${agentId}/tasks/${taskId}/`
  );
  return data;
}

export async function cancelAgentTask(
  agentId: string,
  taskId: string
): Promise<AgentTaskDetail> {
  const { data } = await api.post<AgentTaskDetail>(
    `/toony-agents/${agentId}/tasks/${taskId}/cancel/`
  );
  return data;
}

// ── System Events ──

export async function listSystemEvents(
  agentId: string,
  params?: { event_type?: string; project_id?: string }
): Promise<PaginatedResponse<AgentSystemEventItem>> {
  const { data } = await api.get<PaginatedResponse<AgentSystemEventItem>>(
    `/toony-agents/${agentId}/system-events/`,
    { params }
  );
  return data;
}

// ── Task Events ──

export async function listTaskEvents(
  agentId: string,
  taskId: string,
  afterSequence?: number
): Promise<TaskEventItem[]> {
  const params: Record<string, string> = {};
  if (afterSequence !== undefined) params.after_sequence = String(afterSequence);
  const { data } = await api.get<TaskEventItem[]>(
    `/toony-agents/${agentId}/tasks/${taskId}/events/`,
    { params }
  );
  return data;
}
