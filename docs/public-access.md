# Making Images (objects) Publicly Accessible


IAM user also needs s3:PutObjectAcl

- created an inline policy to allow this


## Bucket must allow Public ACLs

Prerequisite, disable S3 block public access

- S3 console > Permissions tab > uncheck block public access

Then we need to create a public access ACL

- S3 console > permissions tab > go to access control list > Everyone (public access) select read