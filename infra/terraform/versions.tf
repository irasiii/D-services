terraform {
  required_version = ">= 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # State lives in S3 (see README.md for the one-time bucket setup). Pass the bucket at init time:
  #   terraform init -backend-config="bucket=<state-bucket>" -backend-config="key=d-services/dev.tfstate" \
  #                  -backend-config="region=ap-southeast-2"
  backend "s3" {
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "d-services"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name = "d-services-${var.environment}"
  azs  = slice(data.aws_availability_zones.available.names, 0, 3)
}
