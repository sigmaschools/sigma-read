export const dynamic = "force-dynamic";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { apiRoute, apiError, apiJson, visibleStudent } from "@/lib/api-v1/auth";
import { studentDetail } from "@/lib/api-v1/students";

/** GET /api/v1/students/by-external/{externalId} — look a student up by their Compass ID */
export const GET = apiRoute<{ externalId: string }>("students:read", async (_req, client, { externalId }) => {
  let decoded: string;
  try { decoded = decodeURIComponent(externalId); } catch { return apiError(404, "Student not found"); }
  // Same shape admins can set; anything else can't exist (and a NUL byte would make Postgres throw)
  if (!/^[\w.:-]{1,100}$/.test(decoded)) return apiError(404, "Student not found");
  const [row] = await db.select({ id: schema.students.id }).from(schema.students)
    .where(eq(schema.students.externalId, decoded)).limit(1);
  const student = row ? await visibleStudent(client, row.id) : null;
  if (!student) return apiError(404, "Student not found");
  return apiJson(await studentDetail(student));
});
