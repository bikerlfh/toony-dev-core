import api from "@/lib/api";
import type {
  AgentSkill,
  CreateAgentSkillPayload,
  UpdateAgentSkillPayload,
  PaginatedResponse,
} from "@/types";

export async function listAgentSkills(
  agentSlug: string,
  cursor?: string
): Promise<PaginatedResponse<AgentSkill>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<AgentSkill>>(
    `/agents/${agentSlug}/skills/`,
    { params }
  );
  return data;
}

export async function assignSkill(
  agentSlug: string,
  payload: CreateAgentSkillPayload
): Promise<AgentSkill> {
  const { data } = await api.post<AgentSkill>(
    `/agents/${agentSlug}/skills/`,
    payload
  );
  return data;
}

export async function updateAgentSkill(
  agentSlug: string,
  agentSkillId: string,
  payload: UpdateAgentSkillPayload
): Promise<AgentSkill> {
  const { data } = await api.put<AgentSkill>(
    `/agents/${agentSlug}/skills/${agentSkillId}/`,
    payload
  );
  return data;
}

export async function removeAgentSkill(
  agentSlug: string,
  agentSkillId: string
): Promise<void> {
  await api.delete(
    `/agents/${agentSlug}/skills/${agentSkillId}/`
  );
}
