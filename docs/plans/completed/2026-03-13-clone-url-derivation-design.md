# Clone URL Derivation from Repository URL

## Problem

`ProjectSettings.repository_url` stores the browser URL (e.g., `https://github.com/bikerlfh/toony-dev-core`), but `git clone` requires a clone URL (e.g., `git@github.com:bikerlfh/toony-dev-core.git` for SSH or `https://github.com/bikerlfh/toony-dev-core.git` for HTTPS). The runner currently passes `repository_url` directly to `git clone`, which fails.

## Design

### Runner-side only -- no backend changes

**New function `build_clone_url(repository_url, protocol) -> str`** in `workspace.py`:

Parses the browser URL and constructs the clone URL based on the configured protocol.

```
Input:  https://github.com/bikerlfh/toony-dev-core
Output (ssh):   git@github.com:bikerlfh/toony-dev-core.git
Output (https): https://github.com/bikerlfh/toony-dev-core.git
```

Supported providers: GitHub, GitLab, Bitbucket. For unrecognized hosts, applies the same generic pattern (works for self-hosted GitLab, Gitea, etc.).

Conversion logic:
- Parse `repository_url` with `urllib.parse.urlparse`
- Extract `host` and `path` (strip leading `/`, strip trailing `.git` if present)
- SSH: `git@{host}:{path}.git`
- HTTPS: `https://{host}/{path}.git`

**New config setting `clone_protocol`:**

```yaml
clone_protocol: ssh  # ssh | https (default: ssh)
```

Added to the runner's `config.yml`. Read during startup, passed to `clone_pending_repos`.

**Integration in `clone_pending_repos()`:**

Before calling `_async_git_clone`, convert `repository_url` via `build_clone_url()`.

**Update README.md** configuration table with the new `clone_protocol` setting.

## Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Where to derive | Runner | No backend changes needed, `repository_url` stays as browser URL |
| Protocol | Configurable (ssh/https) | Different machines have different credential setups |
| Default protocol | ssh | Most common for dev machines with SSH keys |
| Providers | GitHub + GitLab + Bitbucket + generic | Covers 99% of cases, generic fallback for self-hosted |
