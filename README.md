# D-services

[![CI](https://github.com/irasiii/D-services/actions/workflows/ci.yml/badge.svg)](https://github.com/irasiii/D-services/actions/workflows/ci.yml)
[![Security](https://github.com/irasiii/D-services/actions/workflows/security.yml/badge.svg)](https://github.com/irasiii/D-services/actions/workflows/security.yml)
[![CodeQL](https://github.com/irasiii/D-services/actions/workflows/codeql.yml/badge.svg)](https://github.com/irasiii/D-services/actions/workflows/codeql.yml)

## Where things live

| What | Where |
| --- | --- |
| Code | <https://github.com/irasiii/D-services> |
| Work tracking (Jira, key `DS`) | <https://por1.atlassian.net/jira/software/projects/DS/boards/37/backlog> |
| Documentation (Confluence, key `DS`) | <https://por1.atlassian.net/wiki/spaces/DS> |

## Repository layout

```
.github/workflows/   CI and DevSecOps pipelines
docs/                Docs that should version with the code
src/                 Application code
tests/               Tests
```

## Pipelines

| Workflow | Runs on | What it does |
| --- | --- | --- |
| `ci.yml` | push to `main`, PRs | Lints the workflows (actionlint); builds and tests whatever stack it finds (Node or Python) |
| `security.yml` | push to `main`, PRs, weekly | Gitleaks secret scan, Trivy dependency / IaC / secret scan (fails on fixable HIGH or CRITICAL), dependency review on PRs, SPDX SBOM artifact |
| `codeql.yml` | push to `main`, PRs, weekly | CodeQL static analysis (currently the workflows; add app languages to the matrix) |
| `pr-jira-key.yml` | PRs | PR title must start with a Jira key, e.g. `DS-12 Add login endpoint` |

Findings appear under **Security > Code scanning**. All third-party actions are
pinned to commit SHAs and kept current by Dependabot.

## Working on a change

1. Pick or create a work item in Jira (`DS-123`).
2. Branch from `main`: `git switch -c DS-123-short-description`.
3. Commit with the key in the message: `DS-123 Add health endpoint`.
4. Open a PR titled `DS-123 ...`; all checks must be green before merge.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
