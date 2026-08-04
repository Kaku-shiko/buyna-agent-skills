# Reusable AWS project model

Use one local deployment identity and isolate cloud resources per project.

| Concern | Default AWS service | Rule |
| --- | --- | --- |
| Frontend | S3 + CloudFront | Private origin, HTTPS, SPA fallback when needed |
| Buyna long-running backend | Existing Buyna EC2 `35.73.127.215` | Verify the instance through AWS first; create zero additional EC2 instances |
| Optional serverless API | Lambda + API Gateway | Use only when the approved project architecture explicitly requires serverless; do not replace the fixed Buyna EC2 target |
| Structured data | RDS PostgreSQL | Private networking, backups, migrations |
| Files and images | S3 | Separate bucket/prefix and least-privilege access |
| Secrets | Secrets Manager | Backend access only; never expose to frontend |
| Domain | Route 53 + ACM | Validate DNS and HTTPS after deployment |
| Observability | CloudWatch | Preserve deployment and application logs |

Resource naming pattern: `<project-slug>-<environment>-<resource>`.

Recommended environments: `dev`, `staging`, `prod`. Never point development code at the production database by default.

For Buyna deployment, reuse the verified existing EC2 instance with isolated
application directories, PM2/systemd process names, ports, Nginx routes, logs,
and environment files. Inspect conflicts before deployment. If the instance
cannot be verified as `35.73.127.215`, stop instead of creating another host.
