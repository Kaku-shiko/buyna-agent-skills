# New merchant onboarding contract

## Intake record

```yaml
merchant:
  project_id: customer-project
  seller_id: customer-seller
  display_name: Customer Store
  primary_host: shop.example.com
  type: product
  language: ja
  currency: JPY
  admin_username: customer-admin
  payment_required_now: false
resources:
  database_mode: existing
  database_connection_source: DATABASE_URL_OR_APPROVED_RUNTIME_PATH
  storage_mode: existing
  bucket: approved-existing-bucket
  region: ap-northeast-1
  compute: approved-existing-instance
  process: approved-existing-process
  port: approved-existing-port
  allow_create_rds: false
  allow_create_database: false
  allow_create_schema: false
  allow_create_bucket: false
  allow_create_instance: false
  allow_create_port: false
release_limits:
  new_ec2_instances: 0
  new_databases: 0
  new_buckets: 0
  new_ports: 0
```

Store no secrets in this record.

## Canonical ownership

- Treat `project_id + seller_id` as the owner identity.
- Register the same canonical identifiers in Buyna.ai CRM. Add the new
  `seller_id` to `CRM_MERCHANT_SUBSCRIPTION_SELLERS` through the approved
  server configuration and verify the read-only subscription response contains
  only plan, status, start date, and bound domain.
- The merchant application resolves identity from its server configuration and
  authenticated session. A browser-supplied `seller_id` or copied sample
  merchant value is never authoritative.
- Resolve the tenant server-side from an approved exact hostname or authenticated session.
- Scope every product, category, service, order, customer, payment, and media query to the resolved seller.
- Reject unknown hosts and sessions issued for another seller.
- Generate new object keys as:

```text
projects/{project_id}/sellers/{seller_id}/{entity_type}/{entity_id}/{uuid}.{ext}
```

- Allow a legacy prefix only for the merchant that owns it and only while the migration fallback remains approved.

## Registration states

Use `pending` or inactive while preparing the merchant. An inactive merchant
must not resolve from its public hostname. Change to `active` only after the
validation matrix passes.

## Required validation matrix

Record `PASS`, `FAIL`, or `N/A` for each applicable check:

| Area | Required proof |
|---|---|
| Existing merchant | Health, product/service count, order count, paid-customer count, and existing image display are unchanged |
| Host routing | New exact host resolves only the new seller; unknown host returns 404 |
| Login | New administrator can log in; its cookie/token returns 401 or 404 against another seller |
| Catalog/service | Create, update, refresh, archive/delete policy, sorting, and public synchronization persist |
| S3 | Upload, signed display, replacement, deletion policy, correct prefix, and cross-seller denial pass |
| Orders | Pending order persists and authorized detail returns the complete safe customer submission |
| Payment | `N/A` or disabled unless seller-owned configuration and provider verification pass |
| CRM GMV | Disabled binding for non-payment merchants; payment merchants require Outbox, worker, CRM identity, paid/refund sync, and matching CRM totals |
| Rollback | Database backup, previous release, and exact reversal command/location are recorded |

Do not activate when any applicable row is `FAIL` or untested.

## Activation record

```yaml
merchant: customer-project/customer-seller
status: active
host: shop.example.com
database_backup: recorded-server-side-location
release: recorded-release-id
rollback: recorded-previous-release-id
new_ec2_instances: 0
new_databases: 0
new_buckets: 0
new_ports: 0
checks:
  existing_merchant_regression: PASS
  tenant_isolation: PASS
  admin_login: PASS
  storage: PASS
  orders: PASS
  payment: N/A
  crm_gmv: DISABLED
```
