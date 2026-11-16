output "cluster_name" {
  description = "EKS cluster name. Connect with: aws eks update-kubeconfig --name <cluster_name> --region <region>"
  value       = aws_eks_cluster.this.name
}

output "vpc_id" {
  description = "VPC ID (needed when installing the AWS Load Balancer Controller)."
  value       = aws_vpc.this.id
}

output "ecr_repository_urls" {
  description = "Image repository URLs to use in deploy/k8s/overlays."
  value       = { for name, repo in aws_ecr_repository.this : name => repo.repository_url }
}

output "github_actions_role_arn" {
  description = "Set this as the GitHub repository variable AWS_ROLE_ARN."
  value       = aws_iam_role.github_actions.arn
}

output "db_endpoint" {
  description = "Database host and port."
  value       = aws_db_instance.this.endpoint
}

output "db_password_secret_arn" {
  description = "Secrets Manager secret holding the database password."
  value       = aws_db_instance.this.master_user_secret[0].secret_arn
}
