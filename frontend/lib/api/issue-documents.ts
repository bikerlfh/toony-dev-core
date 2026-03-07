import api from "@/lib/api";
import type { IssueDocument } from "@/types/issue-documents";
import type { PaginatedResponse } from "@/types";

const base = (projectId: string, issueId: string) =>
  `/projects/${projectId}/issues/${issueId}/documents`;

export async function listIssueDocuments(
  projectId: string,
  issueId: string
): Promise<PaginatedResponse<IssueDocument>> {
  const { data } = await api.get<PaginatedResponse<IssueDocument>>(
    `${base(projectId, issueId)}/`
  );
  return data;
}

export async function uploadIssueDocument(
  projectId: string,
  issueId: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<IssueDocument> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<IssueDocument>(
    `${base(projectId, issueId)}/`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      },
    }
  );
  return data;
}

export async function deleteIssueDocument(
  projectId: string,
  issueId: string,
  documentId: string
): Promise<void> {
  await api.delete(`${base(projectId, issueId)}/${documentId}/`);
}
