# MCP Server Auto-Sync Setup

This document explains how to configure automatic synchronization between the `mcp-server/` directory in this monorepo and the standalone public repository [`bikerlfh/toony-mcp`](https://github.com/bikerlfh/toony-mcp).

## How It Works

A GitHub Actions workflow (`.github/workflows/sync-mcp.yml`) triggers on every push to `main` that includes changes in `mcp-server/`. It copies the contents of `mcp-server/` to the root of `bikerlfh/toony-mcp` and commits them automatically.

```
toony-dev-core (monorepo)          toony-mcp (standalone)
├── backend/                       ├── install.sh
├── frontend/                      ├── update.sh
├── mcp-server/        ──sync──>   ├── uninstall.sh
│   ├── install.sh                 ├── pyproject.toml
│   ├── update.sh                  ├── README.md
│   ├── uninstall.sh               └── src/toony_mcp/...
│   ├── src/toony_mcp/...
│   └── ...
└── ...
```

## Prerequisites

- The target repository `bikerlfh/toony-mcp` must exist on GitHub (can be empty).
- You need admin access to both repositories.

## Step 1: Create the Target Repository

1. Go to [github.com/new](https://github.com/new).
2. Set **Repository name** to `toony-mcp`.
3. Set **Owner** to `bikerlfh`.
4. Set visibility to **Public**.
5. Do **not** initialize with README, .gitignore, or license (the sync will push everything).
6. Click **Create repository**.

## Step 2: Create a Fine-Grained Personal Access Token

The workflow needs a token to push to the target repo.

1. Go to [GitHub Settings > Developer settings > Fine-grained tokens](https://github.com/settings/tokens?type=beta).
2. Click **Generate new token**.
3. Fill in the form:
   - **Token name:** `sync-mcp-server`
   - **Expiration:** choose your preference (e.g., 1 year). Set a calendar reminder to rotate it before expiry.
   - **Resource owner:** `bikerlfh`
   - **Repository access:** select **Only select repositories** → search and select `bikerlfh/toony-mcp`
   - **Permissions > Repository permissions:**
     - **Contents:** Read and write
     - Leave everything else as "No access"
4. Click **Generate token**.
5. **Copy the token immediately** — you will not be able to see it again.

## Step 3: Add the Token as a Repository Secret

1. Go to the monorepo on GitHub: `bikerlfh/toony-dev-core`.
2. Navigate to **Settings** → **Secrets and variables** → **Actions**.
3. Click **New repository secret**.
4. Fill in:
   - **Name:** `MCP_REPO_TOKEN`
   - **Secret:** paste the token from Step 2
5. Click **Add secret**.

## Step 4: Verify the Sync

1. Make any change inside `mcp-server/` (e.g., edit the README).
2. Commit and push to `main`.
3. Go to the monorepo **Actions** tab and confirm the "Sync MCP Server" workflow ran successfully.
4. Check `bikerlfh/toony-mcp` — you should see the synced files with a commit message like `sync: update from toony-dev-core@abc1234`.

## Troubleshooting

### Workflow does not trigger

- The workflow only runs on pushes to `main` that include changes in `mcp-server/**`. If you pushed to a different branch or changed files outside `mcp-server/`, it will not trigger.

### Permission denied on push

- Verify the `MCP_REPO_TOKEN` secret is set correctly in the monorepo.
- Verify the token has **Contents: Read and write** permission on `bikerlfh/toony-mcp`.
- Check if the token has expired.

### "No changes to sync" in workflow logs

- This means the files in `mcp-server/` are already identical to the target repo. No commit is created. This is expected behavior.

## Token Rotation

When the token expires, repeat Steps 2 and 3 to generate a new one and update the secret.
