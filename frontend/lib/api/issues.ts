import api from "@/lib/api";
import type {
  IssueList,
  IssueDetail,
  IssueComment,
  IssueActivity,
  IssueFilters,
  CreateIssuePayload,
  UpdateIssuePayload,
  CreateCommentPayload,
  PaginatedResponse,
} from "@/types";

const base = (orgSlug: string, projectSlug: string) =>
  `/organizations/${orgSlug}/projects/${projectSlug}/issues`;

export async function listIssues(
  orgSlug: string,
  projectSlug: string,
  filters?: IssueFilters,
  cursor?: string
): Promise<PaginatedResponse<IssueList>> {
  const params = new URLSearchParams();
  if (cursor) params.append("cursor", cursor);
  if (filters?.status) params.append("status", filters.status);
  if (filters?.priority) params.append("priority", filters.priority);
  if (filters?.assignee_id) params.append("assignee_id", filters.assignee_id);
  if (filters?.milestone_id) params.append("milestone_id", filters.milestone_id);
  if (filters?.cycle_id) params.append("cycle_id", filters.cycle_id);
  if (filters?.label_ids?.length) {
    filters.label_ids.forEach((id) => params.append("label_ids", id));
  }
  const qs = params.toString();
  const { data } = await api.get<PaginatedResponse<IssueList>>(
    `${base(orgSlug, projectSlug)}/${qs ? `?${qs}` : ""}`
  );
  return data;
}

export async function getIssue(
  orgSlug: string,
  projectSlug: string,
  identifier: string
): Promise<IssueDetail> {
  const { data } = await api.get<IssueDetail>(
    `${base(orgSlug, projectSlug)}/${identifier}/`
  );
  return data;
}

export async function createIssue(
  orgSlug: string,
  projectSlug: string,
  payload: CreateIssuePayload
): Promise<IssueDetail> {
  const { data } = await api.post<IssueDetail>(
    `${base(orgSlug, projectSlug)}/`,
    payload
  );
  return data;
}

export async function updateIssue(
  orgSlug: string,
  projectSlug: string,
  identifier: string,
  payload: UpdateIssuePayload
): Promise<IssueDetail> {
  const { data } = await api.put<IssueDetail>(
    `${base(orgSlug, projectSlug)}/${identifier}/`,
    payload
  );
  return data;
}

export async function deleteIssue(
  orgSlug: string,
  projectSlug: string,
  identifier: string
): Promise<void> {
  await api.delete(`${base(orgSlug, projectSlug)}/${identifier}/`);
}

export async function listComments(
  orgSlug: string,
  projectSlug: string,
  identifier: string,
  cursor?: string
): Promise<PaginatedResponse<IssueComment>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<IssueComment>>(
    `${base(orgSlug, projectSlug)}/${identifier}/comments/`,
    { params }
  );
  return data;
}

export async function createComment(
  orgSlug: string,
  projectSlug: string,
  identifier: string,
  payload: CreateCommentPayload
): Promise<IssueComment> {
  const { data } = await api.post<IssueComment>(
    `${base(orgSlug, projectSlug)}/${identifier}/comments/`,
    payload
  );
  return data;
}

export async function updateComment(
  orgSlug: string,
  projectSlug: string,
  identifier: string,
  commentId: string,
  payload: CreateCommentPayload
): Promise<IssueComment> {
  const { data } = await api.put<IssueComment>(
    `${base(orgSlug, projectSlug)}/${identifier}/comments/${commentId}/`,
    payload
  );
  return data;
}

export async function deleteComment(
  orgSlug: string,
  projectSlug: string,
  identifier: string,
  commentId: string
): Promise<void> {
  await api.delete(
    `${base(orgSlug, projectSlug)}/${identifier}/comments/${commentId}/`
  );
}

export async function listActivities(
  orgSlug: string,
  projectSlug: string,
  identifier: string,
  cursor?: string
): Promise<PaginatedResponse<IssueActivity>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await api.get<PaginatedResponse<IssueActivity>>(
    `${base(orgSlug, projectSlug)}/${identifier}/activities/`,
    { params }
  );
  return data;
}
