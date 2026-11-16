# Security policy

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private reporting:
**Security > Advisories > Report a vulnerability** on this repository.
You can expect an acknowledgement within 5 working days.

## How this repository is protected

| Control | Tool | Where |
| --- | --- | --- |
| Secret scanning | Gitleaks (full history) | `.github/workflows/security.yml` |
| Dependency vulnerabilities (SCA) | Trivy, Dependency Review | `.github/workflows/security.yml` |
| Infrastructure-as-code misconfiguration | Trivy | `.github/workflows/security.yml` |
| Static analysis (SAST) | CodeQL | `.github/workflows/codeql.yml` |
| Software bill of materials | Syft (SPDX JSON artifact) | `.github/workflows/security.yml` |
| Supply chain | SHA-pinned actions, Dependabot, least-privilege tokens | `.github/` |
| Review | CODEOWNERS, PR template security checklist | `.github/` |

## Severity handling

| Severity | Action |
| --- | --- |
| Critical / High with a fix available | Blocks merge |
| Medium | Jira work item, fix within the next sprint |
| Low | Backlog |
