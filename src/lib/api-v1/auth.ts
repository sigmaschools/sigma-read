/**
 * Authentication, scopes, rate limiting and the audit log for /api/v1 routes.
 *
 *   export const GET = apiRoute("students:read", async (req, client) => { ... });
 *
 * Every call (allowed or not, once the key is recognised) gets an api_request_log row.
 */

import { NextRequest, NextResponse } from "next/server";
import { and, count, eq, gte, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { bearerKey, hasScope, hashApiKey, type ApiScope } from "./keys";

export type ApiClient = typeof schema.apiClients.$inferSelect;

/** Requests per key per minute */
export const RATE_LIMIT_PER_MINUTE = 120;

export function apiError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export function apiJson(body: unknown) {
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

type Handler<P> = (req: NextRequest, client: ApiClient, params: P) => Promise<NextResponse>;

export function apiRoute<P = Record<string, never>>(scope: ApiScope, handler: Handler<P>) {
  return async (req: NextRequest, ctx: { params: Promise<P> }) => {
    const key = bearerKey(req.headers.get("authorization"));
    if (!key) return apiError(401, "Missing or malformed API key");

    const [client] = await db.select().from(schema.apiClients)
      .where(and(eq(schema.apiClients.keyHash, hashApiKey(key)), isNull(schema.apiClients.revokedAt)))
      .limit(1);
    if (!client) return apiError(401, "Invalid or revoked API key");

    let res: NextResponse;
    if (!hasScope(client.scopes, scope)) {
      res = apiError(403, `This key lacks the ${scope} scope`);
    } else {
      const [recent] = await db.select({ n: count() }).from(schema.apiRequestLog)
        .where(and(eq(schema.apiRequestLog.clientId, client.id), gte(schema.apiRequestLog.createdAt, new Date(Date.now() - 60_000))));
      if (recent.n >= RATE_LIMIT_PER_MINUTE) {
        res = apiError(429, "Rate limit exceeded");
        res.headers.set("Retry-After", "60");
      } else {
        try {
          res = await handler(req, client, await ctx.params);
        } catch (e) {
          console.error("api/v1 error:", req.nextUrl.pathname, e);
          res = apiError(500, "Internal error");
        }
      }
    }

    // The audit trail must not break the response
    await db.batch([
      db.insert(schema.apiRequestLog).values({ clientId: client.id, method: req.method, path: req.nextUrl.pathname + req.nextUrl.search, status: res.status }),
      db.update(schema.apiClients).set({ lastUsedAt: new Date() }).where(eq(schema.apiClients.id, client.id)),
    ]).catch(e => console.error("api_request_log write failed:", e));
    return res;
  };
}

/** The student, if it exists and this client may see it (a client tied to a guide sees only that guide's students) */
export async function visibleStudent(client: ApiClient, studentId: number) {
  if (!Number.isInteger(studentId) || studentId <= 0) return null;
  const [student] = await db.select().from(schema.students).where(eq(schema.students.id, studentId)).limit(1);
  if (!student || (client.guideId !== null && student.guideId !== client.guideId)) return null;
  return student;
}
