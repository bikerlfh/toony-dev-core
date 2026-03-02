import api from "@/lib/api";
import type {
  AgentList,
  AgentDetail,
  CreateAgentPayload,
  UpdateAgentPayload,
  PaginatedResponse,
} from "@/types";

export async function listAgents(
  cursor?: string
): Promise<PaginatedResponse<AgentList>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<AgentList>>(
    `/agents/`,
    { params }
  );
  return data;
}

export async function createAgent(
  payload: CreateAgentPayload
): Promise<AgentDetail> {
  const { data } = await api.post<AgentDetail>(
    `/agents/`,
    payload
  );
  return data;
}

export async function getAgent(
  agentSlug: string
): Promise<AgentDetail> {
  const { data } = await api.get<AgentDetail>(
    `/agents/${agentSlug}/`
  );
  return data;
}

export async function updateAgent(
  agentSlug: string,
  payload: UpdateAgentPayload
): Promise<AgentDetail> {
  const { data } = await api.put<AgentDetail>(
    `/agents/${agentSlug}/`,
    payload
  );
  return data;
}

export async function deleteAgent(
  agentSlug: string
): Promise<void> {
  await api.delete(`/agents/${agentSlug}/`);
}
