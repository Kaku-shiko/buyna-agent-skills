import {createHash} from 'node:crypto';

export function identifier(value) {
  if (typeof value !== 'string' || !/^[a-z_][a-z0-9_]{0,62}$/.test(value)) throw Error('INVALID_SCHEMA');
  return `"${value}"`;
}

// Infrastructure owns schema creation. This migration only adds namespaced tables
// to an already registered schema, never a replacement database.
export function migrationSql(schema) {
  const s = identifier(schema);
  return `CREATE TABLE ${s}.buyna_backend_records (
    project_id text NOT NULL, seller_id text NOT NULL,
    kind text NOT NULL, id text NOT NULL, body jsonb NOT NULL,
    PRIMARY KEY(project_id,seller_id,kind,id),
    CHECK (jsonb_typeof(body)='object'),
    CHECK (body->>'projectId' IS NOT DISTINCT FROM project_id),
    CHECK (body->>'sellerId' IS NOT DISTINCT FROM seller_id)
  );
  CREATE INDEX buyna_backend_records_status ON ${s}.buyna_backend_records
    (project_id,seller_id,kind,(body->>'status'));
  CREATE INDEX buyna_backend_records_expiry ON ${s}.buyna_backend_records
    (project_id,seller_id,kind,(body->>'expiresAt'));`;
}

export async function migrateBackend({pool, schema}) {
  const s = identifier(schema), sql = migrationSql(schema);
  const digest = createHash('sha256').update(sql).digest('hex');
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`buyna-backend-migration:${schema}`]);
    const exists = await db.query('SELECT 1 FROM pg_namespace WHERE nspname=$1', [schema]);
    if (!exists.rows.length) throw Error('REGISTERED_SCHEMA_REQUIRED');
    await db.query(`CREATE TABLE IF NOT EXISTS ${s}.buyna_backend_migrations (version integer PRIMARY KEY, digest text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    const previous = await db.query(`SELECT digest FROM ${s}.buyna_backend_migrations WHERE version=1`);
    if (previous.rows.length) {
      if (previous.rows[0].digest !== digest) throw Error('MIGRATION_DIGEST_MISMATCH');
    } else {
      await db.query(sql);
      await db.query(`INSERT INTO ${s}.buyna_backend_migrations(version,digest) VALUES (1,$1)`, [digest]);
    }
    await db.query('COMMIT');
    return {version:1, digest, applied:!previous.rows.length};
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally { db.release(); }
}

export async function rollbackEmptyBackend({pool,schema}) {
  const s=identifier(schema),db=await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`buyna-backend-migration:${schema}`]);
    await db.query(`LOCK TABLE ${s}.buyna_backend_records IN ACCESS EXCLUSIVE MODE`);
    const result=await db.query(`SELECT 1 FROM ${s}.buyna_backend_records LIMIT 1`);
    if(result.rows.length) throw Error('ROLLBACK_REQUIRES_DATA_PRESERVING_MIGRATION');
    await db.query(`DROP TABLE ${s}.buyna_backend_records`);
    await db.query(`DROP TABLE ${s}.buyna_backend_migrations`);
    await db.query('COMMIT');
  } catch(error) {await db.query('ROLLBACK');throw error;}
  finally {db.release();}
}

export function createPostgresRecords({pool, schema, projectId, sellerId}) {
  const table = `${identifier(schema)}.buyna_backend_records`;
  for (const value of [projectId,sellerId]) {
    if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(value)) throw Error('INVALID_MERCHANT_SCOPE');
  }
  const scope = Object.freeze({projectId,sellerId});
  function records(db, inTransaction=false) {
    return {
      scope,
      async get(kind,id) {
        const result = await db.query(`SELECT body FROM ${table} WHERE project_id=$1 AND seller_id=$2 AND kind=$3 AND id=$4`, [projectId,sellerId,kind,id]);
        return result.rows[0]?.body ?? null;
      },
      async put(kind,id,body) {
        if (!inTransaction) throw Error('WRITE_TRANSACTION_REQUIRED');
        if (body.projectId !== projectId || body.sellerId !== sellerId) throw Error('MERCHANT_SCOPE_MISMATCH');
        await db.query(`INSERT INTO ${table}(project_id,seller_id,kind,id,body) VALUES ($1,$2,$3,$4,$5::jsonb)
          ON CONFLICT(project_id,seller_id,kind,id) DO UPDATE SET body=EXCLUDED.body`, [projectId,sellerId,kind,id,JSON.stringify(body)]);
        return structuredClone(body);
      },
      async list(kind, {limit=100,offset=0,status=null}={}) {
        if (!Number.isSafeInteger(limit)||limit<1||limit>1000||!Number.isSafeInteger(offset)||offset<0) throw Error('INVALID_PAGINATION');
        const result = await db.query(`SELECT body FROM ${table} WHERE project_id=$1 AND seller_id=$2 AND kind=$3
          AND ($4::text IS NULL OR body->>'status'=$4) ORDER BY id LIMIT $5 OFFSET $6`, [projectId,sellerId,kind,status,limit,offset]);
        return result.rows.map(row=>row.body);
      },
      async scan(kind,{after='',limit=100,status=null}={}) {
        if(typeof after!=='string'||!Number.isSafeInteger(limit)||limit<1||limit>1000) throw Error('INVALID_PAGINATION');
        const result=await db.query(`SELECT id,body FROM ${table} WHERE project_id=$1 AND seller_id=$2 AND kind=$3
          AND id>$4 AND ($5::text IS NULL OR body->>'status'=$5) ORDER BY id LIMIT $6`,[projectId,sellerId,kind,after,status,limit]);
        return {items:result.rows.map(row=>row.body),next:result.rows.length===limit?result.rows.at(-1).id:null};
      },
      async transaction(work) {
        if (inTransaction) return work(records(db,true));
        const connection = await pool.connect();
        try {
          await connection.query('BEGIN');
          // shortcut: serialize writes per merchant; replace with row locks when measured throughput requires it.
          await connection.query('SELECT pg_advisory_xact_lock(hashtext($1))', [JSON.stringify([schema,projectId,sellerId])]);
          const result = await work(records(connection,true));
          await connection.query('COMMIT');
          return result;
        } catch (error) { await connection.query('ROLLBACK'); throw error; }
        finally { connection.release(); }
      }
    };
  }
  return records(pool);
}
