export type ImportJobStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "PARTIALLY_COMPLETED";

export type ImportProvider =
  | "LINEAR"
  | "JIRA"
  | "TRELLO"
  | "ASANA"
  | "GITHUB_PROJECTS";

export interface ImportJob {
  id: string;
  provider: ImportProvider;
  status: ImportJobStatus;
  progress: number;
  total_items: number;
  imported_items: number;
  created_at: string;
}

export interface ImportJobDetail {
  id: string;
  provider: ImportProvider;
  status: ImportJobStatus;
  config: Record<string, unknown>;
  progress: number;
  total_items: number;
  imported_items: number;
  error_log: Array<{ external_id?: string; title?: string; error: string }>;
  started_by: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
  } | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface ImportMapping {
  id: string;
  external_id: string;
  external_type: string;
  internal_id: string;
  internal_type: string;
  created_at: string;
}

export interface ExternalProject {
  id: string;
  name: string;
  description: string;
  url: string;
}

export interface StartImportPayload {
  provider: ImportProvider;
  external_project_id: string;
  target_project_slug: string;
  config?: Record<string, unknown>;
}
