-- Apply only in the registered existing database/schema (set search_path in
-- the migration runner). No database/schema creation and no automatic seed.
CREATE TABLE merchant_storage_accounts (
  project_id text NOT NULL,
  seller_id text NOT NULL,
  used_bytes bigint NOT NULL CHECK (used_bytes >= 0),
  reserved_bytes bigint NOT NULL DEFAULT 0 CHECK (reserved_bytes >= 0),
  PRIMARY KEY (project_id,seller_id)
);
CREATE TABLE merchant_storage_objects (
  project_id text NOT NULL,
  seller_id text NOT NULL,
  request_key text NOT NULL,
  object_key text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  status text NOT NULL CHECK (status IN ('reserved','confirmed','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id,seller_id,request_key),
  UNIQUE (project_id,seller_id,object_key),
  FOREIGN KEY (project_id,seller_id) REFERENCES merchant_storage_accounts(project_id,seller_id)
);
