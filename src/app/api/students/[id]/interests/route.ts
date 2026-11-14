export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { interestSummaryFor, setTopicRemoved, topicLabels } from "@/lib/interest-graph";

/** Admins see and edit a student's interests here; guides and guardians do it in Compass */
async function canManage(session: { role: string }): Promise<boolean> {
  return session.role === "admin";
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
  if (!studentId || !(await canManage(session))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await interestSummaryFor(studentId));
}

/** POST { slug, removed: boolean }: take a topic off the student's interests, or put it back */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const studentId = await studentFrom(params);
  if (!studentId || !(await canManage(session))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (typeof body?.slug !== "string" || typeof body?.removed !== "boolean") {
    return NextResponse.json({ error: "slug and removed are required" }, { status: 400 });
  }
  if (!(await topicLabels([body.slug])).has(body.slug)) return NextResponse.json({ error: "Unknown topic" }, { status: 400 });

  // Compass holds the record. If it doesn't confirm the change, the panel shows what still stands
  await setTopicRemoved(studentId, body.slug, body.removed, session);
  return NextResponse.json(await interestSummaryFor(studentId));
}
