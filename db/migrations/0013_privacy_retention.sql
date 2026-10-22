-- Additive only. Run later under controlled deployment; never applies retention by itself.
CREATE TABLE IF NOT EXISTS privacy_retention_holds (
  resource text NOT NULL CHECK (resource IN ('admin_session','audit_event','consent_receipt')),
  record_key text NOT NULL CHECK (length(record_key) BETWEEN 1 AND 64),
  case_ref varchar(120) NOT NULL,
  basis text NOT NULL CHECK (basis IN ('incident','legal_duty','rights_request')),
  review_at timestamptz NOT NULL,
  PRIMARY KEY (resource, record_key)
);

-- An operator attestation that prior-data duties, proof purposes and vendor actions
-- are completed. No age-based presumption, no backdating, no change to event versions.
CREATE TABLE IF NOT EXISTS privacy_consent_completion (
  receipt_hash varchar(64) PRIMARY KEY CHECK (receipt_hash ~ '^[a-f0-9]{64}$'),
  completed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decision_ref varchar(120) NOT NULL
);

-- Restricted destruction event extract. Subjects are existing technical identifiers,
-- never copied IPs, User-Agents, tokens or cookie signatures. A signed act is separate.
CREATE TABLE IF NOT EXISTS privacy_destruction_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destroyed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  stage text NOT NULL,
  system_name text NOT NULL DEFAULT 'auto-zap PostgreSQL',
  reason text NOT NULL,
  categories text NOT NULL,
  method text NOT NULL,
  affected_count integer NOT NULL CHECK (affected_count > 0),
  subjects jsonb NOT NULL,
  retain_until timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '3 years')
);
CREATE INDEX IF NOT EXISTS privacy_destruction_evidence_retention_idx
  ON privacy_destruction_evidence(retain_until);

-- One bounded health row per stage. No accumulating operational log, no raw errors/PD.
CREATE TABLE IF NOT EXISTS privacy_retention_health (
  stage text PRIMARY KEY,
  attempted_at timestamptz NOT NULL,
  succeeded_at timestamptz,
  status text NOT NULL CHECK (status IN ('ok','failed','busy')),
  affected_count integer NOT NULL DEFAULT 0
);
