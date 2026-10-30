export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { inArray } from "drizzle-orm";
import { saveCheckin, type CheckinAnswer } from "@/lib/interest-graph";

const ANSWERS: CheckinAnswer[] = ["keep", "less", "reject"];

/** Save "Still into these?" answers: { answers: [{ slug, answer: "keep" | "less" | "reject" }] }. An empty list is a skip. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "student") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const raw: unknown[] = Array.isArray(body?.answers) ? body.answers.slice(0, 3) : [];
  const answers = raw
    .filter((a): a is { slug: string; answer: CheckinAnswer } =>
      typeof (a as { slug?: unknown })?.slug === "string" && ANSWERS.includes((a as { answer?: CheckinAnswer }).answer!))
    .map(a => ({ slug: a.slug, answer: a.answer }));

  // Only real topics
  const slugs = [...new Set(answers.map(a => a.slug))];
  const known = slugs.length > 0
    ? new Set((await db.select({ slug: schema.topics.slug }).from(schema.topics).where(inArray(schema.topics.slug, slugs))).map(t => t.slug))
    : new Set<string>();

  await saveCheckin(session.userId, answers.filter(a => known.has(a.slug)));
  return NextResponse.json({ ok: true });
}
