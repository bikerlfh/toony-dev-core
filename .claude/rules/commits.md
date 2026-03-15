# Git Commit Rules

- Do NOT add `Co-Authored-By` lines or any Claude attribution in commit messages.
- Do NOT sign commits with `--gpg-sign` or `-S`.
- Use conventional commit format: `type(scope): description` (e.g., `feat(projects): add cycle filtering`).
- Keep the subject line under 72 characters.
- After the subject line, add a blank line followed by a bulleted list (`- `) summarizing the individual changes. Each bullet should be a concise description of one logical change.
- Example:
  ```
  fix(mcp): align MCP tools with backend API changes

  - Fix search param: send ?q= instead of ?search= (projects, issues, labels)
  - Fix update_issue: use PUT instead of PATCH to match backend view
  - Update README, skill docs, and frontend for nullable agent_task
  ```
- Valid types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `ci`, `style`, `perf`, `build`.
- Scope should match the Django app or frontend area being changed (e.g., `accounts`, `projects`, `frontend`).
