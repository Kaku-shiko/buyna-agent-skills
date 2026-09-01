# Reusable AWS project model

Use one local deployment identity and isolate cloud resources per project.

| Concern | Default AWS service | Rule |
| --- | --- | --- |
| Frontend | S3 + CloudFront | Private origin, HTTPS, SPA fallback when needed |
| Buyna long-running backend | Registered existing Buyna EC2 | Resolve its stable `instance_id` from the project record and verify its current addresses through AWS; create zero additional EC2 instances |
| Optional serverless API | Lambda + API Gateway | Use only when the approved project architecture explicitly requires serverless; do not replace the fixed Buyna EC2 target |
| Structured data | RDS PostgreSQL | Private networking, backups, migrations |
| Files and images | S3 | Separate bucket/prefix and least-privilege access |
| Secrets | Secrets Manager | Backend access only; never expose to frontend |
| Domain | Route 53 + ACM | Validate DNS and HTTPS after deployment |
| Observability | CloudWatch | Preserve deployment and application logs |

Resource naming pattern: `<project-slug>-<environment>-<resource>`.

Recommended environments: `dev`, `staging`, `prod`. Never point development code at the production database by default.

For Buyna deployment, reuse the EC2 instance from the project resource record
after current AWS verification, with isolated
application directories, PM2/systemd process names, ports, Nginx routes, logs,
and environment files. Inspect conflicts before deployment. If its stable
instance ID, account, region, or environment ownership cannot be verified,
stop instead of creating another host. Treat its current IP as refreshed
evidence, not as a global identity constant.
