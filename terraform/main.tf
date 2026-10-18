data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "test" {
bucket = "taskflow-test-${data.aws_caller_identity.current.account_id}"
}