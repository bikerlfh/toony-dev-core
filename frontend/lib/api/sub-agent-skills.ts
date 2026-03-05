import api from "@/lib/api";
import type {
  SubAgentSkill,
  CreateSubAgentSkillPayload,
  UpdateSubAgentSkillPayload,
  PaginatedResponse,
} from "@/types";

export async function listSubAgentSkills(
  subAgentId: string,
  cursor?: string
): Promise<PaginatedResponse<SubAgentSkill>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<SubAgentSkill>>(
    `/subagents/${subAgentId}/skills/`,
    { params }
  );
  return data;
}

export async function assignSkill(
  subAgentId: string,
  payload: CreateSubAgentSkillPayload
): Promise<SubAgentSkill> {
  const { data } = await api.post<SubAgentSkill>(
    `/subagents/${subAgentId}/skills/`,
    payload
  );
  return data;
}

export async function updateSubAgentSkill(
  subAgentId: string,
  subAgentSkillId: string,
  payload: UpdateSubAgentSkillPayload
): Promise<SubAgentSkill> {
  const { data } = await api.put<SubAgentSkill>(
    `/subagents/${subAgentId}/skills/${subAgentSkillId}/`,
    payload
  );
  return data;
}

export async function removeSubAgentSkill(
  subAgentId: string,
  subAgentSkillId: string
): Promise<void> {
  await api.delete(
    `/subagents/${subAgentId}/skills/${subAgentSkillId}/`
  );
}
