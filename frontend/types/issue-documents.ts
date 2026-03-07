export interface IssueDocument {
  id: string;
  original_filename: string;
  file: string;
  file_size: number;
  content_type: string;
  uploaded_by: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  created_at: string;
}
