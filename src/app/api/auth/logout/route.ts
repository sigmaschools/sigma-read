export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { compassAdminUrl } from "@/lib/compass-profile";

export async function POST() {
  // compassAdmin: where "Sign out" on the admin pages leads, since there is no sign-in page here
  const res = NextResponse.json({ ok: true, compassAdmin: compassAdminUrl() });
  res.cookies.set("session", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
