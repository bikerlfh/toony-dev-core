import api from "@/lib/api";
import type { Cycle, CreateCyclePayload, UpdateCyclePayload } from "@/types";

const base = (orgSlug: string, projectSlug: string) =>
  `/organizations/${orgSlug}/projects/${projectSlug}/cycles`;

export async function listCycles(
  orgSlug: string,
  projectSlug: string
): Promise<Cycle[]> {
  const { data } = await api.get<Cycle[]>(`${base(orgSlug, projectSlug)}/`);
  return data;
}

export async function createCycle(
  orgSlug: string,
  projectSlug: string,
  payload: CreateCyclePayload
): Promise<Cycle> {
  const { data } = await api.post<Cycle>(
    `${base(orgSlug, projectSlug)}/`,
    payload
  );
  return data;
}

export async function getCycle(
  orgSlug: string,
  projectSlug: string,
  cycleId: string
): Promise<Cycle> {
  const { data } = await api.get<Cycle>(
    `${base(orgSlug, projectSlug)}/${cycleId}/`
  );
  return data;
}

export async function updateCycle(
  orgSlug: string,
  projectSlug: string,
  cycleId: string,
  payload: UpdateCyclePayload
): Promise<Cycle> {
  const { data } = await api.put<Cycle>(
    `${base(orgSlug, projectSlug)}/${cycleId}/`,
    payload
  );
  return data;
}

export async function deleteCycle(
  orgSlug: string,
  projectSlug: string,
  cycleId: string
): Promise<void> {
  await api.delete(`${base(orgSlug, projectSlug)}/${cycleId}/`);
}
