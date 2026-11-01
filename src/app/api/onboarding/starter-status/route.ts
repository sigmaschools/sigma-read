export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { starterStatus } from "@/lib/starter-articles";

/** How many of a new student's first articles are ready; polled by the onboarding tutorial */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "student") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const status = await starterStatus(session.userId);
  if (!status) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(status);
}
