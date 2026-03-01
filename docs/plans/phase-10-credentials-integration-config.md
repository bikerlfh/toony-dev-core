# Phase 10: Credentials & Integration Config

## Overview
Phase 10 adds **RepositoryCredential** and **IntegrationConfig** — two org-scoped models that store encrypted secrets for repository access and third-party integrations. These are prerequisites for the Import System (Phase 12) and Agent communication (Phase 14).

## Models

### RepositoryCredential
- Org-scoped model for storing encrypted repository access credentials
- Fields: name, provider (GitHub/GitLab/Bitbucket/Custom), credential_type (Token/SSH Key/App Credential), encrypted_value (EncryptedTextField), url_pattern, is_active
- Unique constraint on (organization, name)

### IntegrationConfig
- Org-scoped model for storing encrypted third-party integration credentials
- Fields: provider (Linear/Jira/Trello/Slack/Custom), encrypted_credentials (EncryptedTextField, JSON serialized), webhook_url, is_active
- Unique constraint on (organization, provider)

### ProjectSettings FK
- Added `repository_credential` FK (nullable) to ProjectSettings to link projects to a credential

## API Endpoints
All endpoints require `IsOrganizationAdmin` permission (OWNER/ADMIN roles only).

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/organizations/{slug}/credentials/` | List credentials |
| POST | `/api/v1/organizations/{slug}/credentials/` | Create credential |
| GET | `/api/v1/organizations/{slug}/credentials/{id}/` | Get credential |
| PUT | `/api/v1/organizations/{slug}/credentials/{id}/` | Update credential |
| DELETE | `/api/v1/organizations/{slug}/credentials/{id}/` | Delete credential |
| GET | `/api/v1/organizations/{slug}/integrations/` | List integrations |
| POST | `/api/v1/organizations/{slug}/integrations/` | Create integration |
| GET | `/api/v1/organizations/{slug}/integrations/{id}/` | Get integration |
| PUT | `/api/v1/organizations/{slug}/integrations/{id}/` | Update integration |
| DELETE | `/api/v1/organizations/{slug}/integrations/{id}/` | Delete integration |

## Key Decisions
1. Both models in the organizations app (org-scoped settings)
2. EncryptedTextField for JSON credentials (django-encrypted-model-fields v0.6.5 lacks native JSON support)
3. Admin-only access for all endpoints
4. Write-only secrets — encrypted fields never appear in API responses
5. Dedicated `/credentials` page with tabbed UI (Repository Credentials + Integrations)

## Frontend
- Tabbed page at `/{orgSlug}/credentials/` with table views for both credential types
- CRUD modals for create/edit operations
- Sidebar navigation entry added before Settings
- Gated by `canEditOrg()` role check for write actions
