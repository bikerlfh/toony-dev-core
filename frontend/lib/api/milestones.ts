import api from "@/lib/api";
import type {
  Milestone,
  CreateMilestonePayload,
  UpdateMilestonePayload,
} from "@/types";

const base = (orgSlug: string, projectSlug: string) =>
  `/organizations/${orgSlug}/projects/${projectSlug}/milestones`;

export async function listMilestones(
  orgSlug: string,
  projectSlug: string
): Promise<Milestone[]> {
  const { data } = await api.get<Milestone[]>(`${base(orgSlug, projectSlug)}/`);
  return data;
}

export async function createMilestone(
  orgSlug: string,
  projectSlug: string,
  payload: CreateMilestonePayload
): Promise<Milestone> {
  const { data } = await api.post<Milestone>(
    `${base(orgSlug, projectSlug)}/`,
    payload
  );
  return data;
}

export async function getMilestone(
  orgSlug: string,
  projectSlug: string,
  milestoneId: string
): Promise<Milestone> {
  const { data } = await api.get<Milestone>(
    `${base(orgSlug, projectSlug)}/${milestoneId}/`
  );
  return data;
}

export async function updateMilestone(
  orgSlug: string,
  projectSlug: string,
  milestoneId: string,
  payload: UpdateMilestonePayload
): Promise<Milestone> {
  const { data } = await api.put<Milestone>(
    `${base(orgSlug, projectSlug)}/${milestoneId}/`,
    payload
  );
  return data;
}

export async function deleteMilestone(
  orgSlug: string,
  projectSlug: string,
  milestoneId: string
): Promise<void> {
  await api.delete(`${base(orgSlug, projectSlug)}/${milestoneId}/`);
}
