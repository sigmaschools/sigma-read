export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { createToken } from "@/lib/auth";
import { getJwtSecret } from "@/lib/jwt-secret";

interface AutoLoginPayload {
  userId: number;
  role: "parent";
  childId: number;
  autoLogin: true;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing_token", req.url));
  }

  let jwtSecret: string;
  try {
    jwtSecret = getJwtSecret();
  } catch {
    return NextResponse.json({ error: "JWT_SECRET not configured" }, { status: 500 });
  }

  let payload: AutoLoginPayload;
  try {
    payload = jwt.verify(token, jwtSecret) as AutoLoginPayload;
  } catch {
    return NextResponse.redirect(new URL("/login?error=invalid_token", req.url));
  }

  if (!payload.autoLogin || payload.role !== "parent") {
    return NextResponse.redirect(new URL("/login?error=invalid_token", req.url));
  }

  // Create a standard 7-day session token
  const sessionToken = createToken({ userId: payload.userId, role: "parent" });

  const res = NextResponse.redirect(
    new URL(`/parent?child=${payload.childId}`, req.url),
    302
  );
  res.cookies.set("session", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return res;
}
