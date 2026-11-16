# D-services

[![CI](https://github.com/irasiii/D-services/actions/workflows/ci.yml/badge.svg)](https://github.com/irasiii/D-services/actions/workflows/ci.yml)
[![Security](https://github.com/irasiii/D-services/actions/workflows/security.yml/badge.svg)](https://github.com/irasiii/D-services/actions/workflows/security.yml)
[![CodeQL](https://github.com/irasiii/D-services/actions/workflows/codeql.yml/badge.svg)](https://github.com/irasiii/D-services/actions/workflows/codeql.yml)

One company, every kind of delivery: courier, removals, heavy freight (within and
between states), earth removal, food delivery and rides. Providers register with
their own vehicle and licence, whatever its size. Each service has its own app;
all apps share one core platform that manages customers, providers, services and
charging. The company earns a percentage or a fixed fee per job, set per service
and adjustable per provider.

## Where things live

| What | Where |
| --- | --- |
| Code | <https://github.com/irasiii/D-services> |
| Work tracking (Jira, key `DS`) | <https://por1.atlassian.net/jira/software/projects/DS/boards/37/backlog> |
| Documentation (Confluence, key `DS`) | <https://por1.atlassian.net/wiki/spaces/DS> |

## Repository layout

```
packages/charging/     Shared charging rules: fee split, platform pricing, vehicle classes (pure TypeScript)
apps/api/              Core platform API: customers, providers, services, jobs, bids, charges (Fastify + PostgreSQL)
apps/courier-web/      First service app: courier (React + Vite) with customer, driver and company views
deploy/k8s/            Kubernetes manifests for AWS EKS (Kustomize: base + dev and prod overlays)
infra/terraform/       AWS foundation as code: VPC, EKS, ECR, RDS, GitHub sign-in role
.github/workflows/     CI and DevSecOps pipelines
```

Each new service gets its own app under `apps/` and reuses the same API.

## Run it locally

Needs Node.js 22 or newer and Docker (for PostgreSQL). CI and the container images use Node.js 26.

```
docker compose up -d db              # PostgreSQL on localhost:5432
npm install
copy .env.example .env               # Windows (use cp on macOS/Linux)

# Terminal 1: API on http://localhost:3000 (applies database migrations on start)
set DATABASE_URL=postgres://dservices:dservices@localhost:5432/dservices
npm run dev:api

# Terminal 2: courier app on http://localhost:5173
npm run dev:courier
```

In PowerShell use `$env:DATABASE_URL="postgres://..."` instead of `set`.

Try the whole flow in the courier app: register a customer and book a delivery
(**Send a parcel**), register a driver (**Drive**), approve the driver
(**Company**), then accept, pick up and deliver the job. The charge appears
under **Company** with the company fee and the driver payout.

### Or run everything in containers

```
docker compose --profile app up --build
```

Courier app on <http://localhost:8080>, API on <http://localhost:3000>. These are
the same images that run on Kubernetes.

## Deploying to AWS

The platform runs as Docker containers on Kubernetes (Amazon EKS), with images
in Amazon ECR and the database on Amazon RDS for PostgreSQL. Create the AWS
resources with [infra/terraform](infra/terraform/README.md), then deploy with
[deploy/README.md](deploy/README.md).

## Tests

```
set TEST_DATABASE_URL=postgres://dservices:dservices@localhost:5432/dservices_test
npm test          # charging unit tests + API tests against a real PostgreSQL
npm run lint      # TypeScript type checks
```

The API tests wipe the database they are pointed at, so use a separate one
(`docker compose exec db createdb -U dservices dservices_test`).

## How charging works

| Service | Price is set by | Company fee (default) |
| --- | --- | --- |
| Courier | Platform (base + per km, scaled by vehicle size) | 15% |
| Food delivery | Platform | 20% |
| Rides | Platform | 20% |
| Removals | Provider bids, customer picks one | 10% |
| Heavy freight | Provider bids | $50 fixed |
| Earth removal | Provider bids | $40 fixed |

These are starting values, changeable through `PATCH /services/:id`. A provider
can have a negotiated fee per service (`PUT /providers/:id/services/:serviceId`)
that overrides the default. When a job is completed, one charge is recorded:
what the customer pays, what the company keeps, what the provider receives.

## API overview

| Area | Endpoints |
| --- | --- |
| Services | `GET /services`, `GET /services/:id`, `PATCH /services/:id` |
| Customers | `POST /customers`, `GET /customers`, `GET /customers/:id`, `POST /customers/:id/block`, `/unblock` |
| Providers | `POST /providers`, `GET /providers`, `GET /providers/:id`, `POST /providers/:id/approve`, `/suspend`, `PUT /providers/:id/services/:serviceId` |
| Jobs | `POST /quotes`, `POST /jobs`, `GET /jobs`, `GET /jobs/:id`, `POST /jobs/:id/accept`, `/bids`, `/bids/:bidId/accept`, `/start`, `/complete`, `/cancel` |
| Charges | `GET /charges`, `GET /charges/summary`, `POST /charges/:id/mark-paid` |

## Not built yet

- **Sign-in and permissions.** The API has no authentication: anyone who can reach it can call any endpoint. Do not expose it to the internet until this is done.
- **Payments.** Charges are ledger records; no payment gateway is connected.
- **Address search and road distance.** The app uses preset locations and straight-line distance.
- **AWS infrastructure.** The images, Kubernetes manifests and Terraform exist; nothing has been created in AWS or deployed yet.
- **Mobile apps**, and the apps for the other five services.

## Pipelines

| Workflow | Runs on | What it does |
| --- | --- | --- |
| `ci.yml` | push to `main`, PRs | Lints workflows; type-checks, tests (with PostgreSQL) and builds everything; audits production dependencies |
| `security.yml` | push to `main`, PRs, weekly | Gitleaks secret scan, Trivy dependency / IaC / secret scan (fails on fixable HIGH or CRITICAL), dependency review on PRs, SPDX SBOM artifact |
| `codeql.yml` | push to `main`, PRs, weekly | CodeQL static analysis of the TypeScript code and the workflows |
| `containers.yml` | push to `main`, PRs | Lints the Dockerfiles, builds both images, scans them with Trivy (fails on fixable HIGH or CRITICAL), validates the Kubernetes manifests; pushes images to Amazon ECR once AWS is connected |
| `infrastructure.yml` | changes under `infra/` | Terraform format check and validation |
| `pr-jira-key.yml` | PRs | PR title must start with a Jira key, e.g. `DS-12 Add login endpoint` |

All third-party actions are pinned to commit SHAs and kept current by Dependabot.

## Working on a change

1. Pick or create a work item in Jira (`DS-123`).
2. Branch from `main`: `git switch -c DS-123-short-description`.
3. Commit with the key in the message: `DS-123 Add health endpoint`.
4. Open a PR titled `DS-123 ...`; all checks must be green before merge.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
