# Phase 8: AWS Release

Require the approved target/resource record, Phase 7 `PASS`, migration and secrets plans, cost/risk preview, rollback path, and live verification. Preserve the registered architecture: shared merchants use only the verified Buyna EC2 at `35.73.127.215`, while registered serverless/static projects reuse their recorded resources.

Hard release counters are architecture-sensitive:
- `shared_ec2_postgresql`: `RESOURCE_MODE=existing_buyna_resources`, `NEW_EC2_INSTANCES=0`, `NEW_DATABASES=0`, `NEW_BUCKETS=0`, `NEW_PORTS=0`
- `aws_serverless`: verify distribution/table/function and `existing` resource consistency; do not force EC2 counters.
- `aws_static`: verify distribution and bucket path consistency; do not force EC2/数据库/端口新增。

Upload only the runtime artifact and stop rather than create replacement infrastructure.
