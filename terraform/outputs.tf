output "bucket_name"{
    description = "name of test bucket"
    value = aws.aws_s3_bucket.test.bucket
}