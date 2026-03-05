import api from "@/lib/api";
import type {
  SubAgentList,
  SubAgentDetail,
  CreateSubAgentPayload,
  UpdateSubAgentPayload,
  PaginatedResponse,
} from "@/types";

export async function listSubAgents(
  cursor?: string
): Promise<PaginatedResponse<SubAgentList>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<SubAgentList>>(
    `/subagents/`,
    { params }
  );
  return data;
}

export async function createSubAgent(
  payload: CreateSubAgentPayload
): Promise<SubAgentDetail> {
  const { data } = await api.post<SubAgentDetail>(
    `/subagents/`,
    payload
  );
  return data;
}

export async function getSubAgent(
  subAgentId: string
): Promise<SubAgentDetail> {
  const { data } = await api.get<SubAgentDetail>(
    `/subagents/${subAgentId}/`
  );
  return data;
}

export async function updateSubAgent(
  subAgentId: string,
  payload: UpdateSubAgentPayload
): Promise<SubAgentDetail> {
  const { data } = await api.put<SubAgentDetail>(
    `/subagents/${subAgentId}/`,
    payload
  );
  return data;
}

export async function deleteSubAgent(
  subAgentId: string
): Promise<void> {
  await api.delete(`/subagents/${subAgentId}/`);
}
