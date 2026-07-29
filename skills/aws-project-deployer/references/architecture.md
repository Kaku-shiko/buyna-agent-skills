# Reusable AWS project model

Use one local deployment identity and isolate cloud resources per project.

| Concern | Default AWS service | Rule |
| --- | --- | --- |
| Frontend | S3 + CloudFront | Private origin, HTTPS, SPA fallback when needed |
| Backend | Lambda + API Gateway | Use EC2/ECS only for long-running runtime needs |
| Structured data | RDS PostgreSQL | Private networking, backups, migrations |
| Files and images | S3 | Separate bucket/prefix and least-privilege access |
| Secrets | Secrets Manager | Backend access only; never expose to frontend |
| Domain | Route 53 + ACM | Validate DNS and HTTPS after deployment |
| Observability | CloudWatch | Preserve deployment and application logs |

Resource naming pattern: `<project-slug>-<environment>-<resource>`.

Recommended environments: `dev`, `staging`, `prod`. Never point development code at the production database by default.
