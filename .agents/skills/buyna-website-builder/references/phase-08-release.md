# Phase 8: AWS Release

Require the approved target/resource record, confirmed
`projectDeploymentBaseline`, Phase 7 `PASS`, applicable migration/secrets plan,
rollback path, and current release health verification. Reuse the baseline
across later AI tasks and subsequent releases; do not rerun STS, account,
instance ownership, current IP, SSM-online, resource identity, or zero-create
discovery for an unchanged project. Invalidate it only when the normalized
resource record digest changes the account, region, `instance_id`/target,
architecture, ownership boundary, or zero-create policy. SSM unavailability is
a current release execution/connection error and does not invalidate the
baseline. Post-deploy health still runs for every current release.

Immediately before a real shared-host write, run one low-cost read-only
runtime-slot ownership check for the project's directory, process/service,
Socket or assigned port, Nginx host route, environment source, and log path.
This prevents cross-project overwrite without reopening the full AWS gate.

Hard release counters are architecture-sensitive:
- `shared_ec2_postgresql`: `RESOURCE_MODE=existing_buyna_resources`, `NEW_EC2_INSTANCES=0`, `NEW_DATABASES=0`, `NEW_BUCKETS=0`, `NEW_PORTS=0`
- `aws_serverless`: verify distribution/table/function and `existing` resource consistency; do not force EC2 counters.
- `aws_static`: verify distribution and bucket path consistency; do not force EC2/数据库/端口新增。

Upload only the runtime artifact and stop rather than create replacement infrastructure.
