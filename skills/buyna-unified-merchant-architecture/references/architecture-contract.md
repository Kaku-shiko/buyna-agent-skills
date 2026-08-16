# Architecture contract

## Shared resources

- Public ingress: Nginx `80/443`.
- Compute, RDS, PostgreSQL database, S3 bucket, and payment accounts: registered existing resources only.
- Business data: PostgreSQL. Files: existing S3 with server-generated owner prefixes.
- Runtime: an approved shared listener or an isolated Unix Socket. Never allocate an unapproved merchant TCP port.

## Database isolation

Use one existing PostgreSQL database with independent merchant Schemas when approved:

```text
public       shared registry and migration evidence only
merchant_a  merchant A tables and local enum/types
merchant_b  merchant B tables and local enum/types
```

Every business row carries `project_id` and `seller_id`, or uses a documented immutable seller primary key plus `project_id`. Application roles receive only their Schema privileges and cannot create databases or Schemas.

Distinguish the RDS instance identifier, PostgreSQL database name, Schema, database role, `project_id`, and `seller_id`; none are interchangeable.

## Payments

Persist a pending order before provider creation. Keep requested amount equal to the coupon-adjusted order total. Verified Notify/query calls one idempotent transaction for order status, payment event, stock/capacity, paid customer, refund, and GMV outbox. Browser Return is navigation plus bounded server query only.
