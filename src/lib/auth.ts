import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { getJwtSecret } from "@/lib/jwt-secret";

export interface TokenPayload {
  userId: number;
  role: "guide" | "student" | "admin" | "parent";
  /** An admin signed in from Compass: their Compass person id and name, for the audit log and the page header */
  compassId?: string;
  name?: string;
}

export function createToken(payload: TokenPayload, expiresIn: "7d" | "1d" = "7d"): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as TokenPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<TokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;
  const session = verifyToken(token);
  // Guide and parent pages are retired: a session cookie from before still opens nothing
  if (session && (session.role === "guide" || session.role === "parent")) return null;
  return session;
}
