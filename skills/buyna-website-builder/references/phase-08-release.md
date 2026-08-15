# Phase 8: AWS Release

Require the approved target/resource record, Phase 7 `PASS`, migration and secrets plans, cost/risk preview, rollback path, and live verification. Preserve the registered architecture: shared merchants use only the verified Buyna EC2 at `35.73.127.215`, while registered serverless/static projects reuse their recorded resources. Require `RESOURCE_MODE: existing_buyna_resources`, `NEW_EC2_INSTANCES: 0`, `NEW_DATABASES: 0`, `NEW_BUCKETS: 0`, and `NEW_PORTS: 0`; upload only the runtime artifact and stop rather than create replacement infrastructure.
