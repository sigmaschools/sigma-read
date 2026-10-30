/**
 * API keys and request helpers for the read-only /api/v1 (Compass). Pure, so they can be
 * tested without a database; the DB-backed auth is in ./auth.ts.
 */

import { createHash, randomBytes } from "node:crypto";

export const API_SCOPES = ["students:read", "reports:read", "transcripts:read"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

const KEY_PREFIX = "sr_live_";

/** A new key: shown to the admin once, never stored in plain text */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = KEY_PREFIX + randomBytes(24).toString("base64url");
  return { key, prefix: key.slice(0, 12), hash: hashApiKey(key) };
}

/** Keys are 192 random bits, so a fast hash is enough (no salt or slow KDF needed) */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** The key from "Authorization: Bearer <key>", or null */
export function bearerKey(header: string | null): string | null {
  const match = header?.match(/^Bearer\s+(\S+)\s*$/i);
  return match && match[1].startsWith(KEY_PREFIX) ? match[1] : null;
}

export function hasScope(scopes: string[], needed: ApiScope): boolean {
  return scopes.includes(needed);
}

/** Only known scopes, deduplicated */
export function cleanScopes(input: unknown): ApiScope[] {
  if (!Array.isArray(input)) return [];
  return API_SCOPES.filter(s => input.includes(s));
}

/** limit (1–100, default 50) and an opaque cursor (the last id seen) from a query string */
export function pageParams(params: URLSearchParams): { limit: number; after: number | null } | { error: string } {
  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return { error: "limit must be a whole number from 1 to 100" };
  const cursor = params.get("cursor");
  if (cursor === null) return { limit, after: null };
  const after = decodeCursor(cursor);
  if (after === null) return { error: "Invalid cursor" };
  return { limit, after };
}

export function encodeCursor(id: number): string {
  return Buffer.from(`id:${id}`).toString("base64url");
}

export function decodeCursor(cursor: string): number | null {
  const match = Buffer.from(cursor, "base64url").toString().match(/^id:(\d{1,10})$/);
  if (!match) return null;
  const id = Number(match[1]);
  // Ids are int4
  return id <= 2_147_483_647 ? id : null;
}

/**
 * An ISO date (midnight UTC) or a datetime with Z or an offset (a "+" must be sent as %2B),
 * or an error. A datetime without a zone is refused rather than read in server time.
 */
export function sinceParam(value: string | null): Date | null | { error: string } {
  if (value === null) return null;
  const message = "since must be an ISO 8601 date, or a datetime ending in Z or an offset (send + as %2B)";
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2}))?$/.test(value)) return { error: message };
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? { error: message } : date;
}

/**
 * Rows for one page: fetch limit + 1 rows ordered by id, then this returns the page and
 * the cursor for the next one (null on the last page).
 */
export function pageOf<T extends { id: number }>(rows: T[], limit: number): { data: T[]; nextCursor: string | null } {
  const data = rows.slice(0, limit);
  return { data, nextCursor: rows.length > limit ? encodeCursor(data[data.length - 1].id) : null };
}
