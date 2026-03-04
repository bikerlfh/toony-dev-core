import api from "@/lib/api";
import type {
  SubAgentList,
  SubAgentDetail,
  CreateSubAgentPayload,
  UpdateSubAgentPayload,
  PaginatedResponse,
} from "@/types";

export async function listSubAgents(
  orgSlug?: string,
  cursor?: string
): Promise<PaginatedResponse<SubAgentList>> {
  const params: Record<string, string> = {};
  if (orgSlug) params.organization = orgSlug;
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
  subAgentSlug: string
): Promise<SubAgentDetail> {
  const { data } = await api.get<SubAgentDetail>(
    `/subagents/${subAgentSlug}/`
  );
  return data;
}

export async function updateSubAgent(
  subAgentSlug: string,
  payload: UpdateSubAgentPayload
): Promise<SubAgentDetail> {
  const { data } = await api.put<SubAgentDetail>(
    `/subagents/${subAgentSlug}/`,
    payload
  );
  return data;
}

export async function deleteSubAgent(
  subAgentSlug: string
): Promise<void> {
  await api.delete(`/subagents/${subAgentSlug}/`);
}
