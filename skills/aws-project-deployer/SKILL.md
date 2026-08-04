---
name: aws-project-deployer
description: Connect Codex projects to the user's AWS account through the local codex-deploy profile, then prepare, deploy, inspect, update, or troubleshoot websites, APIs, storage, databases, domains, and payment-enabled applications. Use when the user says connect to AWS, deploy or publish a Buyna project to the fixed existing Buyna EC2 server, put it online, use an AWS database, create S3/RDS/CloudFront/Lambda resources, or operate the visual AWS publishing dashboard.
---

# AWS Project Deployer

Use the local AWS CLI profile `codex-deploy`; default to Tokyo `ap-northeast-1` unless the project explicitly requires another region.

## Safety contract

- Never ask the user to paste Access Key IDs, Secret Access Keys, database passwords, or payment credentials into chat, source files, frontend variables, logs, or screenshots.
- Never read or print credential file contents. It is acceptable to report masked metadata, lengths, profile names, and `sts get-caller-identity` results.
- Treat successful STS identity verification as the connection gate. Do not claim AWS is connected or a deployment is live without verification.
- Show the resources to be created and obtain confirmation immediately before creating paid or persistent resources such as RDS, Aurora, NAT Gateway, EC2, ECS, or provisioned capacity.
- Prefer infrastructure as code and reversible updates. Do not delete production resources, databases, buckets, domains, certificates, or secrets without explicit confirmation and a backup/retention check.

## Fixed Buyna server

- Deploy Buyna websites and long-running Buyna backends only to the existing
  Buyna EC2 instance whose public IPv4 address is `35.73.127.215`.
- Never create, clone, replace, terminate, or automatically provision
  another EC2 instance for a Buyna deployment. Do not substitute ECS, App
  Runner, Lightsail, or another compute host without a later explicit change
  to this policy from the user.
- After STS succeeds, identify the EC2 instance by AWS API and verify that its
  current public IPv4 address is exactly `35.73.127.215`, it is running, and it
  belongs to the expected Buyna environment before connecting or deploying.
- Stop and report the mismatch when the address is absent, reassigned, points
  to multiple resources, or cannot be verified. Do not create a replacement.
- Reuse the existing server through isolated application directories,
  processes, ports, Nginx routes, logs, and environment files. Inspect current
  allocations before choosing any of them; never overwrite another site.

## Workflow

1. Inspect the real project: framework, build command, output directory, API/runtime needs, database use, uploads, domains, and environment variables.
2. Run `scripts/verify-connection.ps1`. If it fails, diagnose the exact credential/profile/permission cause without exposing secrets.
3. Resolve and verify the fixed Buyna EC2 target at `35.73.127.215`. Record the
   verified instance id, region, state, public IPv4 address, and existing
   runtime layout. Stop on any mismatch; never provision another instance.
4. Choose the smallest suitable supporting architecture:
   - Static SPA: S3 + CloudFront + ACM + Route 53; add SPA fallback to `index.html`.
   - Serverless application: S3/CloudFront frontend + API Gateway/Lambda backend.
   - Buyna long-running service: deploy only to the verified existing Buyna
     EC2 instance; do not force Django or a specific Node version.
   - Structured data: PostgreSQL on RDS by default; keep it private and reachable only by the backend.
   - Files/images: S3, not database blobs.
5. Create a unique normalized project slug. Isolate buckets, distributions, stacks, databases, secrets, logs, and deployment records per project.
6. Generate or update the deployment manifest and infrastructure template in the project. Keep environment-specific values parameterized.
7. Build and test locally. For responsive sites, validate a real mobile viewport and no horizontal overflow.
8. Present a deployment preview: verified existing instance, region, resource list, estimated cost drivers, destructive/replacement risks, domain changes, and rollback path. The preview must state `NEW_EC2_INSTANCES: 0`.
9. After required confirmation, deploy using `--profile codex-deploy --region ap-northeast-1`.
10. Verify the live URL, HTTPS, client-side routes, API health, database migrations, uploads, logs, target instance identity, and rollback state. Report exact verified outcomes; distinguish created resources from planned ones.

## Database and secrets

- Store database credentials and application secrets in AWS Secrets Manager or service-native secret configuration.
- Never make RDS publicly accessible for convenience. Use security groups and private networking.
- Run migrations from the backend/deployment environment, not from browser code.
- Enable backups and deletion protection for production databases; use explicit environment labels for development resources.

## GlobePay integration

- Keep `partner_code`, `credential_code`, signing secrets, and recurring-payment credentials server-side only.
- Route payment work through the available Buyai GlobePay skills when present.
- Do not mark a payment deployment live until notify/return URLs, server-side verification, status sync, and a controlled end-to-end payment test succeed.

Read `references/architecture.md` when selecting resources or explaining the reusable project model.
