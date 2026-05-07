/**
 * Fail-closed JWT_SECRET accessor.
 * Throws if JWT_SECRET is unset or empty — no fallback.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET not configured");
  }
  return secret;
}
