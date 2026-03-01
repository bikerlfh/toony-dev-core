import type { User } from "./auth";

// --- Team ---

export type TeamRole = "LEAD" | "MEMBER";

export interface Team {
  id: string;
  name: string;
  slug: string;
  identifier: string;
  is_active: boolean;
  created_at: string;
}

export interface TeamDetail extends Team {
  description: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  user: User;
  role: TeamRole;
  joined_at: string;
}

export interface CreateTeamPayload {
  name: string;
  slug: string;
  identifier: string;
  description?: string;
}

export interface UpdateTeamPayload {
  name?: string;
  description?: string;
}

export interface AddTeamMemberPayload {
  email: string;
  role?: TeamRole;
}

export interface UpdateTeamMemberRolePayload {
  role: TeamRole;
}

// --- Label ---

export interface Label {
  id: string;
  name: string;
  color: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface CreateLabelPayload {
  name: string;
  color?: string;
  description?: string;
}

export interface UpdateLabelPayload {
  name?: string;
  color?: string;
  description?: string;
}

// --- Project ---

export type ProjectStatus =
  | "BACKLOG"
  | "PLANNED"
  | "IN_PROGRESS"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELED";

export type ProjectPriority = "NONE" | "URGENT" | "HIGH" | "MEDIUM" | "LOW";

export type ProjectMemberRole = "LEAD" | "CONTRIBUTOR" | "REVIEWER";

export type EstimationMethod = "STORY_POINTS" | "T_SHIRT" | "HOURS";

export interface ProjectList {
  id: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  team: Team;
  lead: User | null;
  start_date: string | null;
  target_date: string | null;
  sort_order: number;
  icon: string;
  color: string;
  created_at: string;
}

export interface ProjectDetail extends ProjectList {
  description: string;
  completed_at: string | null;
  updated_at: string;
}

export interface ProjectMember {
  id: string;
  user: User;
  role: ProjectMemberRole;
  joined_at: string;
}

export interface ProjectSettings {
  id: string;
  repository_url: string;
  default_branch: string;
  branch_naming_convention: string;
  required_reviewers_count: number;
  auto_close_completed_issues: boolean;
  issue_prefix_override: string;
  estimation_method: EstimationMethod;
  updated_at: string;
}

export interface CreateProjectPayload {
  team_slug: string;
  name: string;
  slug: string;
  description?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  start_date?: string | null;
  target_date?: string | null;
}

export interface UpdateProjectPayload {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  start_date?: string | null;
  target_date?: string | null;
  sort_order?: number;
  icon?: string;
  color?: string;
}

export interface AddProjectMemberPayload {
  email: string;
  role?: ProjectMemberRole;
}

export interface UpdateProjectMemberRolePayload {
  role: ProjectMemberRole;
}

export interface UpdateProjectSettingsPayload {
  repository_url?: string;
  default_branch?: string;
  branch_naming_convention?: string;
  required_reviewers_count?: number;
  auto_close_completed_issues?: boolean;
  issue_prefix_override?: string;
  estimation_method?: EstimationMethod;
}

// --- Milestone ---

export type MilestoneStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED";

export interface Milestone {
  id: string;
  name: string;
  description: string;
  target_date: string | null;
  status: MilestoneStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateMilestonePayload {
  name: string;
  description?: string;
  target_date?: string | null;
  sort_order?: number;
}

export interface UpdateMilestonePayload {
  name?: string;
  description?: string;
  target_date?: string | null;
  status?: MilestoneStatus;
  sort_order?: number;
}

// --- Cycle ---

export type CycleStatus = "PLANNED" | "ACTIVE" | "COMPLETED";

export interface Cycle {
  id: string;
  name: string;
  number: number;
  start_date: string;
  end_date: string;
  status: CycleStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateCyclePayload {
  name: string;
  start_date: string;
  end_date: string;
}

export interface UpdateCyclePayload {
  name?: string;
  start_date?: string;
  end_date?: string;
  status?: CycleStatus;
}

// --- Issue ---

export type IssueStatus =
  | "BACKLOG"
  | "TODO"
  | "IN_PROGRESS"
  | "IN_REVIEW"
  | "DONE"
  | "CANCELED";

export type IssuePriority = "NONE" | "URGENT" | "HIGH" | "MEDIUM" | "LOW";

export interface IssueList {
  id: string;
  identifier: string;
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
  assignee: User | null;
  labels: Label[];
  estimate: number | null;
  due_date: string | null;
  sort_order: number;
  created_at: string;
}

export interface IssueDetail extends IssueList {
  description: string;
  reporter: User;
  milestone: Milestone | null;
  cycle: Cycle | null;
  parent_identifier: string | null;
  sub_issue_count: number;
  external_tracker_name: string;
  external_tracker_url: string;
  external_tracker_id: string;
  updated_at: string;
}

export interface CreateIssuePayload {
  title: string;
  description?: string;
  status?: IssueStatus;
  priority?: IssuePriority;
  assignee_id?: string | null;
  milestone_id?: string | null;
  cycle_id?: string | null;
  parent_identifier?: string;
  label_ids?: string[];
  estimate?: number | null;
  due_date?: string | null;
  sort_order?: number;
}

export interface UpdateIssuePayload {
  title?: string;
  description?: string;
  status?: IssueStatus;
  priority?: IssuePriority;
  assignee_id?: string | null;
  milestone_id?: string | null;
  cycle_id?: string | null;
  parent_identifier?: string | null;
  label_ids?: string[];
  estimate?: number | null;
  due_date?: string | null;
  sort_order?: number;
  external_tracker_name?: string;
  external_tracker_url?: string;
  external_tracker_id?: string;
}

export interface IssueFilters {
  status?: IssueStatus;
  priority?: IssuePriority;
  assignee_id?: string;
  milestone_id?: string;
  cycle_id?: string;
  label_ids?: string[];
}

// --- Comment ---

export interface IssueComment {
  id: string;
  author: User;
  body: string;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCommentPayload {
  body: string;
}

// --- Activity ---

export interface IssueActivity {
  id: string;
  user: User;
  action: string;
  field_changed: string;
  old_value: string;
  new_value: string;
  created_at: string;
}
