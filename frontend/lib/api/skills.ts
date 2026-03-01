import api from "@/lib/api";
import type {
  SkillList,
  SkillDetail,
  CreateSkillPayload,
  UpdateSkillPayload,
  SkillVersion,
} from "@/types";

export async function listSkills(orgSlug: string): Promise<SkillList[]> {
  const { data } = await api.get<SkillList[]>(
    `/organizations/${orgSlug}/skills/`
  );
  return data;
}

export async function createSkill(
  orgSlug: string,
  payload: CreateSkillPayload
): Promise<SkillDetail> {
  const { data } = await api.post<SkillDetail>(
    `/organizations/${orgSlug}/skills/`,
    payload
  );
  return data;
}

export async function getSkill(
  orgSlug: string,
  skillSlug: string
): Promise<SkillDetail> {
  const { data } = await api.get<SkillDetail>(
    `/organizations/${orgSlug}/skills/${skillSlug}/`
  );
  return data;
}

export async function updateSkill(
  orgSlug: string,
  skillSlug: string,
  payload: UpdateSkillPayload
): Promise<SkillDetail> {
  const { data } = await api.put<SkillDetail>(
    `/organizations/${orgSlug}/skills/${skillSlug}/`,
    payload
  );
  return data;
}

export async function deleteSkill(
  orgSlug: string,
  skillSlug: string
): Promise<void> {
  await api.delete(`/organizations/${orgSlug}/skills/${skillSlug}/`);
}

export async function listSkillVersions(
  orgSlug: string,
  skillSlug: string
): Promise<SkillVersion[]> {
  const { data } = await api.get<SkillVersion[]>(
    `/organizations/${orgSlug}/skills/${skillSlug}/versions/`
  );
  return data;
}
