# Deploying D-services on AWS

Target: Docker containers on Kubernetes (Amazon EKS). Region assumed: `ap-southeast-2` (Sydney).

| Piece | AWS service | In this repository |
| --- | --- | --- |
| Container images | Amazon ECR (`d-services/api`, `d-services/courier-web`) | `apps/*/Dockerfile`, `.github/workflows/containers.yml` |
| Running the containers | Amazon EKS | `deploy/k8s/` |
| Database | Amazon RDS for PostgreSQL | connection string supplied as a Kubernetes Secret |
| Load balancer | Application Load Balancer via the AWS Load Balancer Controller | `deploy/k8s/base/ingress.yaml` |
| Pipeline sign-in to AWS | IAM role assumed through GitHub OIDC (no stored keys) | `containers.yml` |

## What exists and what does not

Built and checked: the two Dockerfiles, the Kubernetes manifests (validated against
the Kubernetes schemas and scanned for misconfigurations), and the pipeline that
builds and scans the images.

Not created yet: the AWS account resources themselves (VPC, EKS cluster, ECR
repositories, RDS instance, IAM role). Nothing has been deployed.

## Layout

```
deploy/k8s/base/            Namespace, API, courier app, network policies, ingress
deploy/k8s/overlays/dev/    1 replica each, namespace d-services-dev
deploy/k8s/overlays/prod/   3+ API replicas, HTTPS, namespace d-services-prod
```

## One-time setup

1. **ECR**: create repositories `d-services/api` and `d-services/courier-web`
   (turn on scan-on-push and tag immutability).
2. **GitHub to AWS**: create an IAM OIDC provider for `token.actions.githubusercontent.com`
   and a role that trusts `repo:irasiii/D-services:ref:refs/heads/main` with permission
   to push to those two repositories. In GitHub, set the repository variable
   `AWS_ROLE_ARN` to the role ARN (and `AWS_REGION` if not Sydney). From then on every
   push to `main` publishes images tagged with the commit SHA.
3. **EKS**: create the cluster with nodes in private subnets across three availability
   zones; install the AWS Load Balancer Controller and metrics-server; enable network
   policy in the VPC CNI add-on.
4. **RDS**: create a PostgreSQL 16 instance in private subnets (Multi-AZ for production,
   encrypted, not publicly accessible) that accepts connections only from the cluster nodes.
5. **Overlays**: replace `111111111111` with the AWS account ID in
   `deploy/k8s/overlays/*/kustomization.yaml`, and the certificate ARN in the prod overlay.

## Deploy

```
# Database connection string: created once per environment, never committed
kubectl create namespace d-services-dev
kubectl -n d-services-dev create secret generic api-database \
  --from-literal=DATABASE_URL='postgres://USER:PASSWORD@RDS-ENDPOINT:5432/dservices?sslmode=require'

# Deploy a specific build
cd deploy/k8s/overlays/dev
kustomize edit set image d-services/api=ACCOUNT.dkr.ecr.ap-southeast-2.amazonaws.com/d-services/api:GIT_SHA
kustomize edit set image d-services/courier-web=ACCOUNT.dkr.ecr.ap-southeast-2.amazonaws.com/d-services/courier-web:GIT_SHA
kubectl apply -k .
kubectl -n d-services-dev rollout status deploy/api deploy/courier-web
```

The API applies database migrations when it starts; a database lock makes this safe
with several replicas.

## Security posture of the manifests

- Containers run as non-root with a read-only root filesystem, no Linux capabilities,
  no privilege escalation, and the default seccomp profile; the namespace enforces the
  Kubernetes "restricted" Pod Security Standard.
- Network policies deny all inbound traffic by default. Only the courier app receives
  traffic from the load balancer; only D-services apps can reach the API.
- The load balancer is **internal** (reachable only inside the VPC). Keep it that way
  until the API has sign-in and permissions (Jira DS-10).
- Pods do not receive a Kubernetes API token.

## Still to decide

- How the AWS resources are created: by hand, or as code (Terraform or AWS CDK). As code is recommended.
- Secrets: move from `kubectl create secret` to AWS Secrets Manager with the External Secrets Operator.
- Delivery: `kubectl apply` from the pipeline, or GitOps (Argo CD / Flux).
- Cluster sizing, and separate AWS accounts or clusters for dev and prod.
