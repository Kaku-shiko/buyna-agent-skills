# Same-database Schema migration

Use source-only online replication; never add application dual-write.

1. Confirm existing RDS/database identity, source/target Schemas, owners, table counts, routes, and zero new-resource counters.
2. Save an encrypted/PITR checkpoint plus a protected logical backup and checksum. Do not print backup rows.
3. Install an append-only change log on the source while it remains the sole writer.
4. Create the target Schema, clone tables/constraints/types, add `project_id`, preserve the existing seller key, and grant a least-privilege application role.
5. Replay source changes in sequence with idempotent upserts/deletes. Compare counts and canonical row digests over common business columns.
6. Build a versioned candidate whose ORM explicitly targets the new Schema. Verify via loopback/Unix Socket before traffic change.
7. Stop the source writer briefly, replay to zero lag, re-check digests, atomically switch environment/release/routing, and test real HTTPS.
8. Remove source capture only after the new writer passes. Keep the source copy read-only for rollback through the stability window.

Required cutover evidence: backup checksum, source digest, target digest, maximum change sequence, replayed sequence, candidate health, exact release, and executable rollback.

PostgreSQL enum types copied with `LIKE` may still reference the source Schema. Localize types or keep ORM enum Schema metadata aligned before cutover.
