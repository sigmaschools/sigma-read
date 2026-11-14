export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
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

  // Saves only a check-in that is due, and only for the topics it offers
  const saved = await saveCheckin(session.userId, answers);
  return NextResponse.json({ ok: true, saved });
}
