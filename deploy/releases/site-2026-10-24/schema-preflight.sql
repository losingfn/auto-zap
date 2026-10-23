-- Read-only compatibility gate. No migrations, catalog writes or retention.
BEGIN READ ONLY;
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(required.t || '.' || required.c, ', ' ORDER BY required.t, required.c)
  INTO missing
  FROM (VALUES
    ('categories','id'), ('categories','is_all_assortment'),
    ('subcategories','id'), ('subcategories','is_hidden'),
    ('products','id'), ('products','catalog_version_id'), ('products','price'),
    ('products','product_identity_id'), ('product_identities','id'),
    ('review_queue','identity_candidate_id'),
    ('review_workspace_items','identity_decision'), ('review_workspace_items','product_identity_id'),
    ('background_jobs','id'), ('import_batches','analyze_job_id'), ('import_batches','publish_job_id'),
    ('import_batches','phase'), ('import_batches','stage'), ('import_batches','progress'),
    ('import_batches','publish_checkpoint'), ('import_batches','last_error_code'),
    ('import_batches','last_error_message'), ('import_batches','processing_updated_at'),
    ('privacy_consent_events','id'), ('privacy_consent_events','receipt_hash'),
    ('privacy_consent_events','operation_id'), ('privacy_consent_events','kind'),
    ('privacy_consent_events','document_version'), ('privacy_consent_events','occurred_at'),
    ('privacy_consent_events','expires_at'),
    ('privacy_retention_holds','resource'), ('privacy_retention_holds','record_key'),
    ('privacy_retention_holds','case_ref'), ('privacy_retention_holds','basis'), ('privacy_retention_holds','review_at'),
    ('privacy_consent_completion','receipt_hash'), ('privacy_consent_completion','completed_at'),
    ('privacy_consent_completion','decision_ref'),
    ('privacy_destruction_evidence','id'), ('privacy_destruction_evidence','destroyed_at'),
    ('privacy_destruction_evidence','stage'), ('privacy_destruction_evidence','system_name'),
    ('privacy_destruction_evidence','reason'), ('privacy_destruction_evidence','categories'),
    ('privacy_destruction_evidence','method'), ('privacy_destruction_evidence','affected_count'),
    ('privacy_destruction_evidence','subjects'), ('privacy_destruction_evidence','retain_until'),
    ('privacy_retention_health','stage'), ('privacy_retention_health','attempted_at'),
    ('privacy_retention_health','succeeded_at'), ('privacy_retention_health','status'),
    ('privacy_retention_health','affected_count')
  ) AS required(t,c)
  WHERE NOT EXISTS (
    -- Catalog metadata remains visible even when retention tables intentionally
    -- have no web-role SELECT grant; retention is not activated by this release.
    SELECT 1 FROM pg_namespace ns
    JOIN pg_class tbl ON tbl.relnamespace=ns.oid
    JOIN pg_attribute col ON col.attrelid=tbl.oid
    WHERE ns.nspname='public' AND tbl.relname=required.t AND col.attname=required.c
      AND col.attnum>0 AND NOT col.attisdropped
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Required schema is missing: %. Stop; do not run all migrations automatically.', missing;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid='public.privacy_consent_events'::regclass
    AND contype='u' AND pg_get_constraintdef(oid)='UNIQUE (operation_id)'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid='public.privacy_consent_events'::regclass
    AND contype='u' AND pg_get_constraintdef(oid)='UNIQUE (receipt_hash, kind)'
  ) THEN RAISE EXCEPTION 'Privacy idempotency constraints are missing. Stop.'; END IF;
  IF NOT has_table_privilege(current_user,'public.privacy_consent_events','SELECT')
    OR NOT has_table_privilege(current_user,'public.privacy_consent_events','INSERT') THEN
    RAISE EXCEPTION 'Privacy journal SELECT/INSERT permissions are missing. Stop.';
  END IF;
END $$;
ROLLBACK;
