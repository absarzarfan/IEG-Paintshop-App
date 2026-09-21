import type { Request } from "express";
import { db, auditLogsTable } from "@workspace/db";

type AuditAction = "create" | "update" | "delete";

interface RecordAuditArgs {
  req: Request;
  action: AuditAction;
  entityType: string;
  entityId: string | number;
  changes: Record<string, unknown>;
}

/** Appends one audit trail entry. Audit rows are never updated or deleted. */
export async function recordAudit({ req, action, entityType, entityId, changes }: RecordAuditArgs): Promise<void> {
  const actor = req.appUser;
  await db.insert(auditLogsTable).values({
    actorUserId: actor?.id ?? null,
    actorName: actor?.name ?? actor?.email ?? null,
    action,
    entityType,
    entityId: String(entityId),
    changes,
  });
}

/**
 * Compares a DB row against a partial update payload and returns only the
 * fields that actually changed, as { field: { old, new } }. Values are
 * compared by string form so e.g. numeric-column strings vs JS numbers still
 * match correctly.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<Record<keyof T, unknown>>,
): Record<string, { old: unknown; new: unknown }> {
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    const newValue = after[key];
    if (newValue === undefined) continue;
    const oldValue = before[key];
    if (String(oldValue) !== String(newValue)) {
      changes[key as string] = { old: oldValue, new: newValue };
    }
  }
  return changes;
}
