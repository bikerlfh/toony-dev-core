import api from "@/lib/api";
import type {
  ToonyAgentList,
  ToonyAgentDetail,
  CreateToonyAgentPayload,
  UpdateToonyAgentPayload,
  ToonyAgentKeyItem,
  AgentTaskList,
  AgentTaskDetail,
  CreateAgentTaskPayload,
  TaskEventItem,
  PaginatedResponse,
} from "@/types";

// ── ToonyAgent CRUD ──

export async function listToonyAgents(
  orgSlug: string,
  cursor?: string
): Promise<PaginatedResponse<ToonyAgentList>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<ToonyAgentList>>(
    `/organizations/${orgSlug}/toony-agents/`,
    { params }
  );
  return data;
}

export async function createToonyAgent(
  orgSlug: string,
  payload: CreateToonyAgentPayload
): Promise<ToonyAgentDetail> {
  const { data } = await api.post<ToonyAgentDetail>(
    `/organizations/${orgSlug}/toony-agents/`,
    payload
  );
  return data;
}

export async function getToonyAgent(
  orgSlug: string,
  agentSlug: string
): Promise<ToonyAgentDetail> {
  const { data } = await api.get<ToonyAgentDetail>(
    `/organizations/${orgSlug}/toony-agents/${agentSlug}/`
  );
  return data;
}

export async function updateToonyAgent(
  orgSlug: string,
  agentSlug: string,
  payload: UpdateToonyAgentPayload
): Promise<ToonyAgentDetail> {
  const { data } = await api.put<ToonyAgentDetail>(
    `/organizations/${orgSlug}/toony-agents/${agentSlug}/`,
    payload
  );
  return data;
}

export async function deleteToonyAgent(
  orgSlug: string,
  agentSlug: string
): Promise<void> {
  await api.delete(`/organizations/${orgSlug}/toony-agents/${agentSlug}/`);
}

// ── API Keys ──

export async function listAgentKeys(
  orgSlug: string,
  agentSlug: string
): Promise<PaginatedResponse<ToonyAgentKeyItem>> {
  const { data } = await api.get<PaginatedResponse<ToonyAgentKeyItem>>(
    `/organizations/${orgSlug}/toony-agents/${agentSlug}/keys/`
  );
  return data;
}

export async function generateAgentKey(
  orgSlug: string,
  agentSlug: string,
  name: string
): Promise<ToonyAgentKeyItem> {
  const { data } = await api.post<ToonyAgentKeyItem>(
    `/organizations/${orgSlug}/toony-agents/${agentSlug}/keys/`,
    { name }
  );
  return data;
}

export async function revokeAgentKey(
  orgSlug: string,
  agentSlug: string,
  keyId: string
): Promise<void> {
  await api.delete(
    `/organizations/${orgSlug}/toony-agents/${agentSlug}/keys/${keyId}/`
  );
}

// ── Tasks ──

export async function listAgentTasks(
  orgSlug: string,
  agentSlug: string,
  cursor?: string
): Promise<PaginatedResponse<AgentTaskList>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<AgentTaskList>>(
    `/organizations/${orgSlug}/toony-agents/${agentSlug}/tasks/`,
    { params }
  );
  return data;
}

export async function createAgentTask(
  orgSlug: string,
  agentSlug: string,
  payload: CreateAgentTaskPayload
): Promise<AgentTaskDetail> {
  const { data } = await api.post<AgentTaskDetail>(
    `/organizations/${orgSlug}/toony-agents/${agentSlug}/tasks/`,
    payload
  );
  return data;
}

export async function getAgentTask(
  orgSlug: string,
  agentSlug: string,
  taskId: string
): Promise<AgentTaskDetail> {
  const { data } = await api.get<AgentTaskDetail>(
    `/organizations/${orgSlug}/toony-agents/${agentSlug}/tasks/${taskId}/`
  );
  return data;
}

export async function cancelAgentTask(
  orgSlug: string,
  agentSlug: string,
  taskId: string
): Promise<AgentTaskDetail> {
  const { data } = await api.post<AgentTaskDetail>(
    `/organizations/${orgSlug}/toony-agents/${agentSlug}/tasks/${taskId}/cancel/`
  );
  return data;
}

export async function listTaskEvents(
  orgSlug: string,
  agentSlug: string,
  taskId: string,
  afterSequence?: number
): Promise<PaginatedResponse<TaskEventItem>> {
  const params: Record<string, string> = {};
  if (afterSequence !== undefined) params.after_sequence = String(afterSequence);
  const { data } = await api.get<PaginatedResponse<TaskEventItem>>(
    `/organizations/${orgSlug}/toony-agents/${agentSlug}/tasks/${taskId}/events/`,
    { params }
  );
  return data;
}
