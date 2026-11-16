# Contributing

## Flow

- Every change starts from a Jira work item in project `DS`.
- Short-lived branches off `main`, named `DS-<number>-short-description`.
- Commit messages and PR titles start with the key: `DS-42 Fix token refresh`.
  With the GitHub for Jira app connected, this links branches, commits and PRs to the work item.
- Merge by pull request only, squash-merged, once CI, Security and CodeQL are green.

## Definition of done

- Code reviewed and merged to `main`
- Tests added or updated, CI green
- No open HIGH / CRITICAL security findings introduced by the change
- Docs updated (README, `docs/`, or Confluence) where behaviour changed
- Jira work item moved to Done

## Security expectations

- Never commit secrets. Use `.env` locally (git-ignored) and GitHub Actions secrets in CI.
- New GitHub Actions must be pinned to a full commit SHA with the version in a comment.
- Workflows declare least-privilege `permissions`.
- Triage scanner findings in the PR: fix, or document why it is a false positive.
