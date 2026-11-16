variable "environment" {
  description = "Environment name, used in resource names (dev, prod)."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9]{1,10}$", var.environment))
    error_message = "Use a short lowercase name such as dev or prod."
  }
}

variable "region" {
  description = "AWS region."
  type        = string
  default     = "ap-southeast-2"
}

variable "vpc_cidr" {
  description = "Address range of the VPC. Must be a /16."
  type        = string
  default     = "10.20.0.0/16"
}

variable "single_nat_gateway" {
  description = "One NAT gateway for the whole VPC (cheaper) instead of one per availability zone (more resilient)."
  type        = bool
  default     = true
}

variable "cluster_admin_cidrs" {
  description = "Public IP ranges allowed to reach the Kubernetes API, e.g. [\"203.0.113.10/32\"]. No default on purpose: never use 0.0.0.0/0."
  type        = list(string)

  validation {
    condition     = length(var.cluster_admin_cidrs) > 0 && !contains(var.cluster_admin_cidrs, "0.0.0.0/0")
    error_message = "List at least one address range, and not 0.0.0.0/0."
  }
}

variable "kubernetes_version" {
  description = "EKS Kubernetes version, e.g. \"1.34\". Leave null to use the current EKS default when the cluster is created."
  type        = string
  default     = null
}

variable "node_instance_types" {
  description = "EC2 instance types for the worker nodes."
  type        = list(string)
  default     = ["t3.medium"]
}

variable "node_count" {
  description = "Worker nodes: minimum, desired and maximum."
  type = object({
    min     = number
    desired = number
    max     = number
  })
  default = { min = 2, desired = 2, max = 4 }
}

variable "db_instance_class" {
  description = "RDS instance size."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_multi_az" {
  description = "Run a standby database in a second availability zone. Turn on for production."
  type        = bool
  default     = false
}

variable "db_deletion_protection" {
  description = "Block deletion of the database. Turn on for production."
  type        = bool
  default     = false
}

variable "ecr_repositories" {
  description = "Container image repositories to create."
  type        = list(string)
  default     = ["d-services/api", "d-services/courier-web"]
}

variable "github_repository" {
  description = "GitHub repository (owner/name) whose main branch may push images."
  type        = string
  default     = "irasiii/D-services"
}

variable "create_github_oidc_provider" {
  description = "Create the GitHub OIDC identity provider. Set to false if this AWS account already has one."
  type        = bool
  default     = true
}
