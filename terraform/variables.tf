variable "region" {
  type    = string
  default = "ap-south-1"
}

variable "project" {
  type    = string
  default = "cloudnative-demo"
}

variable "github_repo" {
  description = "GitHub repo allowed to push images, format owner/repo"
  type        = string
}

variable "my_ip_cidr" {
  description = "Your public IP in CIDR form (e.g. 203.0.113.10/32) allowed to reach the EKS API"
  type        = string
}

variable "node_instance_type" {
  type    = string
  default = "t3.medium"
}
