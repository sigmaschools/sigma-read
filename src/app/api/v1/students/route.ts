export const dynamic = "force-dynamic";
import { and, asc, eq, gt, type SQL } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { apiRoute, apiError, apiJson } from "@/lib/api-v1/auth";
import { pageParams, pageOf } from "@/lib/api-v1/keys";
import { activityFor, guideExternalIds, studentOut } from "@/lib/api-v1/students";

/** GET /api/v1/students?limit=&cursor= — students in id order, cursor-paginated */
export const GET = apiRoute("students:read", async (req, client) => {
  const page = pageParams(req.nextUrl.searchParams);
  if ("error" in page) return apiError(400, page.error);

  const conditions: SQL[] = [];
  if (page.after !== null) conditions.push(gt(schema.students.id, page.after));
  if (client.guideId !== null) conditions.push(eq(schema.students.guideId, client.guideId));

  const rows = await db.select().from(schema.students)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(schema.students.id))
    .limit(page.limit + 1);
  const { data, nextCursor } = pageOf(rows, page.limit);

  const [guides, activity] = await Promise.all([
    guideExternalIds(data.map(s => s.guideId)),
    activityFor(data.map(s => s.id)),
  ]);
  return apiJson({ data: data.map(s => studentOut(s, guides, activity.get(s.id))), nextCursor });
});
