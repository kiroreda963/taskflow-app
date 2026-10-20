variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-central-1"
}
variable "project"{
  type = string
  default = "taskflow"
}

variable "vpc-cidr"{
  type = string
  default = "10.0.0.0/16"
}

variable "az_count"{
  type = number
  default = 2
}