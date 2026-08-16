import { db } from "@/db/client";
import { auditLogs } from "@/db/schema";

type ImportAuditInput = {
  adminUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Audit history is useful, but it must never turn an already committed import
 * operation into a user-visible failure. Callers should invoke this only after
 * their primary transaction has succeeded.
 */
export async function writeImportAuditSafely(input: ImportAuditInput) {
  try {
    await db.insert(auditLogs).values({
      adminUserId: input.adminUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? {}
    });
  } catch {
    console.error("[import/audit] audit_write_failed", {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null
    });
  }
}
