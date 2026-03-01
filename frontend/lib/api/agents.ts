import api from "@/lib/api";
import type {
  AgentList,
  AgentDetail,
  CreateAgentPayload,
  UpdateAgentPayload,
  PaginatedResponse,
} from "@/types";

export async function listAgents(
  orgSlug: string,
  cursor?: string
): Promise<PaginatedResponse<AgentList>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<AgentList>>(
    `/organizations/${orgSlug}/agents/`,
    { params }
  );
  return data;
}

export async function createAgent(
  orgSlug: string,
  payload: CreateAgentPayload
): Promise<AgentDetail> {
  const { data } = await api.post<AgentDetail>(
    `/organizations/${orgSlug}/agents/`,
    payload
  );
  return data;
}

export async function getAgent(
  orgSlug: string,
  agentSlug: string
): Promise<AgentDetail> {
  const { data } = await api.get<AgentDetail>(
    `/organizations/${orgSlug}/agents/${agentSlug}/`
  );
  return data;
}

export async function updateAgent(
  orgSlug: string,
  agentSlug: string,
  payload: UpdateAgentPayload
): Promise<AgentDetail> {
  const { data } = await api.put<AgentDetail>(
    `/organizations/${orgSlug}/agents/${agentSlug}/`,
    payload
  );
  return data;
}

export async function deleteAgent(
  orgSlug: string,
  agentSlug: string
): Promise<void> {
  await api.delete(`/organizations/${orgSlug}/agents/${agentSlug}/`);
}
