import api from "@/lib/api";
import type {
  SkillList,
  SkillDetail,
  CreateSkillPayload,
  UpdateSkillPayload,
  SkillVersion,
  PaginatedResponse,
} from "@/types";

export async function listSkills(
  cursor?: string
): Promise<PaginatedResponse<SkillList>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<SkillList>>(
    `/skills/`,
    { params }
  );
  return data;
}

export async function createSkill(
  payload: CreateSkillPayload
): Promise<SkillDetail> {
  const { data } = await api.post<SkillDetail>(
    `/skills/`,
    payload
  );
  return data;
}

export async function getSkill(
  skillId: string
): Promise<SkillDetail> {
  const { data } = await api.get<SkillDetail>(
    `/skills/${skillId}/`
  );
  return data;
}

export async function updateSkill(
  skillId: string,
  payload: UpdateSkillPayload
): Promise<SkillDetail> {
  const { data } = await api.put<SkillDetail>(
    `/skills/${skillId}/`,
    payload
  );
  return data;
}

export async function deleteSkill(
  skillId: string
): Promise<void> {
  await api.delete(`/skills/${skillId}/`);
}

export async function listSkillVersions(
  skillId: string,
  cursor?: string
): Promise<PaginatedResponse<SkillVersion>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<SkillVersion>>(
    `/skills/${skillId}/versions/`,
    { params }
  );
  return data;
}
