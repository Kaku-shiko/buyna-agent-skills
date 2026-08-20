CREATE TABLE IF NOT EXISTS merchant_idempotency (
  project_id text NOT NULL,
  seller_id text NOT NULL,
  idempotency_key text NOT NULL,
  operation text NOT NULL,
  status text NOT NULL CHECK (status IN ('processing', 'completed')),
  result_json jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  completed_at timestamptz,
  PRIMARY KEY (project_id, seller_id, idempotency_key, operation)
);
