---
name: aws-project-deployer
description: Connect Codex projects to AWS through the local codex-deploy profile, then inspect, deploy, update, or troubleshoot Buyna websites on approved existing resources. Use for the fixed Buyna EC2 release path and existing database/S3/domain operations; use new infrastructure only when the user explicitly requests and separately approves it.
---

# AWS Project Deployer

Use the local AWS CLI profile `codex-deploy`; default to Tokyo `ap-northeast-1` unless the project explicitly requires another region.

## Safety contract

- Never ask the user to paste Access Key IDs, Secret Access Keys, database passwords, or payment credentials into chat, source files, frontend variables, logs, or screenshots.
- Never read or print credential file contents. It is acceptable to report masked metadata, lengths, profile names, and `sts get-caller-identity` results.
- Treat successful STS identity verification as the connection gate. Do not claim AWS is connected or a deployment is live without verification.
- Show the resources to be created and obtain confirmation immediately before creating paid or persistent resources such as RDS, Aurora, NAT Gateway, EC2, ECS, or provisioned capacity.
- Prefer infrastructure as code and reversible updates. Do not delete production resources, databases, buckets, domains, certificates, or secrets without explicit confirmation and a backup/retention check.

## Resource Mode

- Run `buyna-project-resource-registry` first. Default every task to `existing_buyna_resources` and preserve its registered architecture: shared EC2/PostgreSQL, AWS serverless, AWS static, or external legacy.
- For a new shared merchant, reuse the verified EC2 instance, approved PostgreSQL connection, approved S3 bucket, project prefix, and existing network/domain boundary. For a registered serverless/static project, reuse its recorded CloudFront, Lambda/API, DynamoDB, and S3 resources; do not force it onto EC2/RDS.
- Never infer permission to create a bucket, database, RDS/Aurora/DynamoDB resource, CloudFront distribution, Lambda/API stack, compute host, or extra port from a normal build, publish, storage, or database request.
- Enter `new_infrastructure` only when the user explicitly requests new infrastructure, names the required resource class, and approves the cost/risk preview. This mode is outside `buyna-website-builder` and `buyna-aws-release`.

## Fixed Buyna server

- Deploy new shared Buyna merchant websites and long-running Buyna backends only to the existing
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
3. Match the live architecture to the validated resource record. For `shared_ec2_postgresql`, resolve and verify the fixed Buyna EC2 target at `35.73.127.215`. Record the
   verified instance id, region, state, public IPv4 address, and existing
   runtime layout. Stop on any mismatch; never provision another instance.
4. Preserve the inspected runtime stack. For shared merchants, deploy only to the verified existing EC2 and use the approved PostgreSQL/S3 resources. For registered serverless/static projects, update only their recorded existing resources. Do not force Django, EC2, RDS, or a specific Node version across architectures.
5. Create a unique normalized project slug. Isolate application directories, processes, assigned ports, Nginx routes, database schema/ownership, S3 prefixes, secrets, logs, and deployment records inside the approved shared resources. Do not create per-project buckets or databases.
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
