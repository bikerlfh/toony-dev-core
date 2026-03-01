import api from "@/lib/api";
import type { Label, CreateLabelPayload, UpdateLabelPayload } from "@/types";

export async function listLabels(orgSlug: string): Promise<Label[]> {
  const { data } = await api.get<Label[]>(
    `/organizations/${orgSlug}/labels/`
  );
  return data;
}

export async function createLabel(
  orgSlug: string,
  payload: CreateLabelPayload
): Promise<Label> {
  const { data } = await api.post<Label>(
    `/organizations/${orgSlug}/labels/`,
    payload
  );
  return data;
}

export async function updateLabel(
  orgSlug: string,
  labelId: string,
  payload: UpdateLabelPayload
): Promise<Label> {
  const { data } = await api.put<Label>(
    `/organizations/${orgSlug}/labels/${labelId}/`,
    payload
  );
  return data;
}

export async function deleteLabel(
  orgSlug: string,
  labelId: string
): Promise<void> {
  await api.delete(`/organizations/${orgSlug}/labels/${labelId}/`);
}
