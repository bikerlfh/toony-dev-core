import type { IssueList, ProjectList, Team, Label } from "./projects";

export type {
  User,
  AuthTokens,
  AuthResponse,
  LoginCredentials,
  RegisterCredentials,
} from "./auth";

export type {
  Organization,
  OrganizationDetail,
  CreateOrganizationPayload,
  UpdateOrganizationPayload,
  MembershipRole,
  Member,
  AddMemberPayload,
  UpdateMemberRolePayload,
  MethodologyChoice,
  OrganizationSettings,
  UpdateOrganizationSettingsPayload,
} from "./organization";

export type {
  TeamRole,
  Team,
  TeamDetail,
  TeamMember,
  CreateTeamPayload,
  UpdateTeamPayload,
  AddTeamMemberPayload,
  UpdateTeamMemberRolePayload,
  Label,
  CreateLabelPayload,
  UpdateLabelPayload,
  ProjectStatus,
  ProjectPriority,
  ProjectMemberRole,
  EstimationMethod,
  ProjectList,
  ProjectDetail,
  ProjectMember,
  ProjectSettings,
  CreateProjectPayload,
  UpdateProjectPayload,
  AddProjectMemberPayload,
  UpdateProjectMemberRolePayload,
  UpdateProjectSettingsPayload,
  MilestoneStatus,
  Milestone,
  CreateMilestonePayload,
  UpdateMilestonePayload,
  CycleStatus,
  Cycle,
  CreateCyclePayload,
  UpdateCyclePayload,
  IssueStatus,
  IssuePriority,
  IssueList,
  IssueDetail,
  CreateIssuePayload,
  UpdateIssuePayload,
  IssueFilters,
  IssueComment,
  CreateCommentPayload,
  IssueActivity,
  ResourceType,
  ProjectResource,
  CreateProjectResourcePayload,
  UpdateProjectResourcePayload,
} from "./projects";

export type {
  CredentialProvider,
  CredentialType,
  IntegrationProvider,
  RepositoryCredential,
  CreateCredentialPayload,
  UpdateCredentialPayload,
  IntegrationConfig,
  CreateIntegrationPayload,
  UpdateIntegrationPayload,
} from "./credentials";

export type {
  AgentStatus,
  AgentType,
  SkillStatus,
  SkillCategory,
  AgentList,
  AgentDetail,
  CreateAgentPayload,
  UpdateAgentPayload,
  SkillList,
  SkillDetail,
  CreateSkillPayload,
  UpdateSkillPayload,
  AgentSkill,
  CreateAgentSkillPayload,
  UpdateAgentSkillPayload,
  SkillVersion,
} from "./agents";

export type {
  ImportJobStatus,
  ImportProvider,
  ImportJob,
  ImportJobDetail,
  ImportMapping,
  ExternalProject,
  StartImportPayload,
} from "./imports";

export type {
  ProjectWsEvent,
  IssueCreatedEvent,
  IssueUpdatedEvent,
  IssueDeletedEvent,
  CommentCreatedEvent,
  CommentUpdatedEvent,
  CommentDeletedEvent,
  AgentWsEvent,
  TaskAssignEvent,
  HeartbeatAckEvent,
  WsReadyState,
} from "./websocket";

// --- Pagination & Search ---

export interface PaginatedResponse<T> {
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface GlobalSearchResult {
  issues: IssueList[];
  projects: ProjectList[];
  teams: Team[];
  labels: Label[];
}
