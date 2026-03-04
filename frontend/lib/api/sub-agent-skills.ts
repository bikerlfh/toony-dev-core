import api from "@/lib/api";
import type {
  SubAgentSkill,
  CreateSubAgentSkillPayload,
  UpdateSubAgentSkillPayload,
  PaginatedResponse,
} from "@/types";

export async function listSubAgentSkills(
  subAgentSlug: string,
  cursor?: string
): Promise<PaginatedResponse<SubAgentSkill>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<SubAgentSkill>>(
    `/subagents/${subAgentSlug}/skills/`,
    { params }
  );
  return data;
}

export async function assignSkill(
  subAgentSlug: string,
  payload: CreateSubAgentSkillPayload
): Promise<SubAgentSkill> {
  const { data } = await api.post<SubAgentSkill>(
    `/subagents/${subAgentSlug}/skills/`,
    payload
  );
  return data;
}

export async function updateSubAgentSkill(
  subAgentSlug: string,
  subAgentSkillId: string,
  payload: UpdateSubAgentSkillPayload
): Promise<SubAgentSkill> {
  const { data } = await api.put<SubAgentSkill>(
    `/subagents/${subAgentSlug}/skills/${subAgentSkillId}/`,
    payload
  );
  return data;
}

export async function removeSubAgentSkill(
  subAgentSlug: string,
  subAgentSkillId: string
): Promise<void> {
  await api.delete(
    `/subagents/${subAgentSlug}/skills/${subAgentSkillId}/`
  );
}
