environment = "prod"

cluster_admin_cidrs = ["REPLACE.WITH.YOUR.IP/32"]

vpc_cidr               = "10.30.0.0/16"
single_nat_gateway     = false
node_instance_types    = ["m6i.large"]
node_count             = { min = 3, desired = 3, max = 9 }
db_instance_class      = "db.t4g.medium"
db_multi_az            = true
db_deletion_protection = true

# The dev environment already created the GitHub identity provider in this account
create_github_oidc_provider = false
