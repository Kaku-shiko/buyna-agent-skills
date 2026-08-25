# ORM Adapter Contract

Use `packages/buyna-postgres-merchant-core` as the fixed runtime module. Use its
`node-postgres` adapter when the project uses `pg`. Generate another adapter
only when the approved project already uses a different ORM.

Configure the fixed module with server-owned identifiers and entity allowlists:

```js
const adapter = createNodePostgresAdapter({
  pool,
  entities: {
    products: {
      table: 'products',
      filters: {status: 'status'},
      sort: {created_at: 'created_at'},
      write: {name: 'name', price: 'price'}
    }
  }
});
const data = createMerchantDataCore({adapter, projectId, sellerId});
const products = data.repository({
  entity: 'products',
  allowedFilters: ['status'],
  allowedSort: ['created_at'],
  allowedWrite: ['name', 'price']
});
```

An adapter must implement:

```js
{
  create(input),
  updateById(input),
  list(input),
  getById(input),
  transaction(work),
  getByIdForUpdate(input),
  listAllForUpdate(input),
  lockingTransaction(work),
  claimIdempotency(input),
  completeIdempotency(input)
}
```

`create`, `updateById`, `list`, and `getById` must apply both `input.scope.projectId` and
`input.scope.sellerId`. The adapter must not accept scope from browser data or
provide an unscoped fallback. Return `{ rows, total }` from `list` and one row
or `null` from single-row operations. Map write fields through a server-owned
allowlist and inject scope columns inside the adapter.

`transaction` must commit only after `work` succeeds, roll back on every thrown
error, and return the work result. Its transaction adapter must satisfy the
same interface.

Lifecycle, featured-selection, and full-ordering operations must use the
explicit locking API:

```js
await data.lockingTransaction(async transactionData => {
  const products = transactionData.lockingRepository({
    entity: 'products',
    allowedFilters: ['status'],
    allowedWrite: ['status', 'featured', 'sort_order']
  });
  const product = await products.getByIdForUpdate(productId);
  const completeScope = await products.listAllForUpdate({filters: {}});
  // Validate the complete locked state before writing through this repository.
});
```

`lockingRepository` is available only inside `lockingTransaction`; callers
cannot silently substitute ordinary reads. The node-postgres adapter uses one
checked-out client, begins a `SERIALIZABLE` transaction, and performs scoped
`FOR UPDATE` reads. `listAllForUpdate` must lock the complete matching merchant
set without pagination, in deterministic ID order. Both locked reads must
include `project_id` and `seller_id`, use parameterized values, and quote only
server-configured identifiers. The transaction must commit on success, roll
back on failure, and always release its client. Ordinary `transaction` and
`repository` remain available for compatible non-locking work.

`claimIdempotency` must rely on a PostgreSQL unique constraint covering
`project_id`, `seller_id`, `idempotency_key`, and `operation`. Return
`{ claimed: true }` only for the first claimant; duplicates return the stored
result without executing work again. `completeIdempotency` stores the result in
the same transaction.

Use parameterized values. Map table and column identifiers only from a
server-owned allowlist. Propagate database and transaction errors; do not hide
them, create a new database, or fall back to SQLite, Supabase, or another data
store.
