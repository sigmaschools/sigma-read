import { db, schema } from "@/lib/db";

export type AdminAction = "student.update" | "student.level_override" | "impersonate.start" | "impersonate.end";

/**
 * Record an admin action. Never throws: a failed audit write is logged, and the action
 * it describes has already happened.
 */
export async function logAdminAction(entry: {
  adminId: number;
  action: AdminAction;
  targetType?: "student" | "guide";
  targetId?: number;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(schema.adminAuditLog).values({
      adminId: entry.adminId,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      details: entry.details ?? {},
    });
  } catch (e) {
    console.error("Admin audit write failed:", entry.action, e);
  }
}
