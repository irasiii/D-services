# AWS foundation (Terraform)

Creates everything D-services needs in AWS for one environment:

| File | Creates |
| --- | --- |
| `network.tf` | VPC, three public and three private subnets, NAT gateway, flow logs |
| `eks.tf` | EKS cluster, worker nodes, add-ons (network policy, DNS, metrics), IAM role for the load balancer controller |
| `ecr.tf` | Image repositories `d-services/api` and `d-services/courier-web` |
| `rds.tf` | PostgreSQL 16 database, private, encrypted, password in Secrets Manager |
| `github-oidc.tf` | Role that lets GitHub Actions push images, without stored keys |

> **This has not been applied or validated against AWS.** It is formatted and scanned
> for misconfigurations, but `terraform validate` and `terraform plan` have not been run
> (the provider could not be downloaded where it was written). Run `plan` and read it
> before `apply`. The Infrastructure workflow runs `validate` on every change.

## Cost

Applying this starts charges immediately, roughly in this order of size for `dev`:
EKS control plane, two `t3.medium` nodes, NAT gateway, RDS `db.t4g.micro`, load
balancer (once the app is deployed). Check current prices with the
[AWS Pricing Calculator](https://calculator.aws/) for `ap-southeast-2` before applying,
and set an AWS Budget alert. `terraform destroy` removes everything again.

## Before you start

- [Terraform](https://developer.hashicorp.com/terraform/install) 1.9 or newer, the
  [AWS CLI](https://aws.amazon.com/cli/), `kubectl` and `helm`
- AWS credentials in your terminal for an identity allowed to create these resources
  (`aws sts get-caller-identity` should show your account)

## 1. One-time: bucket for Terraform state

```
aws s3api create-bucket --bucket <unique-state-bucket-name> --region ap-southeast-2 \
  --create-bucket-configuration LocationConstraint=ap-southeast-2
aws s3api put-bucket-versioning --bucket <unique-state-bucket-name> \
  --versioning-configuration Status=Enabled
aws s3api put-public-access-block --bucket <unique-state-bucket-name> \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

## 2. Create the dev environment

Edit `envs/dev.tfvars` and put your own public IP in `cluster_admin_cidrs`.

```
cd infra/terraform
terraform init -backend-config="bucket=<unique-state-bucket-name>" \
               -backend-config="key=d-services/dev.tfstate" \
               -backend-config="region=ap-southeast-2"
terraform plan  -var-file=envs/dev.tfvars     # read this carefully
terraform apply -var-file=envs/dev.tfvars     # about 20 minutes
```

## 3. Connect the pieces

```
# kubectl access
aws eks update-kubeconfig --name d-services-dev --region ap-southeast-2

# AWS Load Balancer Controller (its IAM role already exists)
helm repo add eks https://aws.github.io/eks-charts
helm install aws-load-balancer-controller eks/aws-load-balancer-controller -n kube-system \
  --set clusterName=d-services-dev --set region=ap-southeast-2 \
  --set vpcId=$(terraform output -raw vpc_id) \
  --set serviceAccount.name=aws-load-balancer-controller
```

- In GitHub, set the repository variable `AWS_ROLE_ARN` to `terraform output -raw github_actions_role_arn`.
  The next push to `main` publishes the images to ECR.
- Put the ECR URLs from `terraform output ecr_repository_urls` into `deploy/k8s/overlays/dev/kustomization.yaml`.
- Then follow `deploy/README.md` to create the database secret and deploy.

## Production

`envs/prod.tfvars` holds larger, more resilient settings (three NAT gateways, bigger
nodes, standby database, deletion protection). Use a separate state key
(`d-services/prod.tfstate`) and, ideally, a separate AWS account.

## Notes

- The Kubernetes API is reachable from the internet only from the addresses in
  `cluster_admin_cidrs`. If your IP changes, update the variable and apply again.
- Whoever runs `terraform apply` becomes the cluster administrator.
- The Kubernetes version defaults to whatever EKS offers when the cluster is created;
  set `kubernetes_version` to pin it.
