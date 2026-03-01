import api from "@/lib/api";
import type {
  AgentSkill,
  CreateAgentSkillPayload,
  UpdateAgentSkillPayload,
} from "@/types";

export async function listAgentSkills(
  orgSlug: string,
  agentSlug: string
): Promise<AgentSkill[]> {
  const { data } = await api.get<AgentSkill[]>(
    `/organizations/${orgSlug}/agents/${agentSlug}/skills/`
  );
  return data;
}

export async function assignSkill(
  orgSlug: string,
  agentSlug: string,
  payload: CreateAgentSkillPayload
): Promise<AgentSkill> {
  const { data } = await api.post<AgentSkill>(
    `/organizations/${orgSlug}/agents/${agentSlug}/skills/`,
    payload
  );
  return data;
}

export async function updateAgentSkill(
  orgSlug: string,
  agentSlug: string,
  agentSkillId: string,
  payload: UpdateAgentSkillPayload
): Promise<AgentSkill> {
  const { data } = await api.put<AgentSkill>(
    `/organizations/${orgSlug}/agents/${agentSlug}/skills/${agentSkillId}/`,
    payload
  );
  return data;
}

export async function removeAgentSkill(
  orgSlug: string,
  agentSlug: string,
  agentSkillId: string
): Promise<void> {
  await api.delete(
    `/organizations/${orgSlug}/agents/${agentSlug}/skills/${agentSkillId}/`
  );
}
