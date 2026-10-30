export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { guideOwnsStudent } from "@/lib/ownership";
import { and, eq } from "drizzle-orm";
import { interestSummaryFor, setTopicRemoved } from "@/lib/interest-graph";

/** The adults who may see and edit a student's interests: their guide, a linked parent, or an admin */
async function canManage(session: { role: string; userId: number }, studentId: number): Promise<boolean> {
  if (session.role === "admin") return true;
  if (session.role === "guide") return guideOwnsStudent(session.userId, studentId);
  if (session.role === "parent") {
    const [link] = await db.select({ id: schema.studentParents.id }).from(schema.studentParents)
      .where(and(eq(schema.studentParents.parentId, session.userId), eq(schema.studentParents.studentId, studentId)))
      .limit(1);
    return !!link;
  }
  return false;
}

async function studentFrom(params: Promise<{ id: string }>) {
  const id = Number((await params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** GET: what the student is into (current, fading, removed) */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const studentId = await studentFrom(params);
  if (!studentId || !(await canManage(session, studentId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await interestSummaryFor(studentId));
}

/** POST { slug, removed: boolean }: take a topic off the student's interests, or put it back */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const studentId = await studentFrom(params);
  if (!studentId || !(await canManage(session, studentId))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (typeof body?.slug !== "string" || typeof body?.removed !== "boolean") {
    return NextResponse.json({ error: "slug and removed are required" }, { status: 400 });
  }
  const [topic] = await db.select({ slug: schema.topics.slug }).from(schema.topics).where(eq(schema.topics.slug, body.slug)).limit(1);
  if (!topic) return NextResponse.json({ error: "Unknown topic" }, { status: 400 });

  await setTopicRemoved(studentId, topic.slug, body.removed, session);
  return NextResponse.json(await interestSummaryFor(studentId));
}
