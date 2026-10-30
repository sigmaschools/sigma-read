import { db, schema } from "@/lib/db";

export type AdminAction = "student.update" | "student.level_override" | "impersonate.start" | "impersonate.end";

export interface AdminActionEntry {
  adminId: number;
  action: AdminAction;
  targetType?: "student" | "guide";
  targetId?: number;
  details?: Record<string, unknown>;
}

/** The audit insert as a query, to run inside the same db.batch as the change it records */
export function auditInsert(entry: AdminActionEntry) {
  return db.insert(schema.adminAuditLog).values({
    adminId: entry.adminId,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    details: entry.details ?? {},
  });
}

/**
 * Best-effort audit write, for actions that must not be blocked by it (leaving impersonation).
 * Never throws: a failed write is logged.
 */
export async function logAdminAction(entry: AdminActionEntry): Promise<void> {
  try {
    await auditInsert(entry);
  } catch (e) {
    console.error("Admin audit write failed:", entry.action, e);
  }
}
