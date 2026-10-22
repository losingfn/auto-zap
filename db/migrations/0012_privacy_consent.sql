-- Append-only technical receipts. Retention is not finalized; no automatic deletion is introduced.
CREATE TABLE IF NOT EXISTS privacy_consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_hash varchar(64) NOT NULL CHECK (receipt_hash ~ '^[a-f0-9]{64}$'),
  operation_id uuid NOT NULL UNIQUE,
  kind varchar(16) NOT NULL CHECK (kind IN ('grant', 'decline', 'revoke')),
  document_version text,
  occurred_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamptz,
  UNIQUE (receipt_hash, kind),
  CHECK (kind <> 'grant' OR (document_version IS NOT NULL AND expires_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS privacy_consent_events_expiry_idx
  ON privacy_consent_events(expires_at) WHERE expires_at IS NOT NULL;
