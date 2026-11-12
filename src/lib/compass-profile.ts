/**
 * The student's profile note from Compass (app contract section 1.1).
 *
 * Compass opens SigmaRead with `#compass_profile=<note>`: a JWT signed with Ed25519 by the
 * Compass server. The server checks it here before it signs a student in, against the keys
 * Compass publishes at `<COMPASS_URL>/.well-known/jwks.json`. No library: Node's crypto
 * verifies Ed25519 from a JSON Web Key directly.
 */
import { createPublicKey, verify, type JsonWebKey } from "node:crypto";

/** Our slug in the Compass registry: a note for any other app is refused */
export const COMPASS_APP_SLUG = "sigma-read";

export interface CompassInterestNote {
  topic: string;
  label: string;
  words?: string[];
}

export interface CompassStudentNote {
  id: string;
  name: string;
  grade?: string;
  interests?: CompassInterestNote[];
}

export interface CompassProfileClaims {
  iss: string;
  aud: string;
  sub: string;
  iat: number;
  exp: number;
  v: number;
  student: CompassStudentNote;
}

export interface Jwk extends JsonWebKey {
  kid?: string;
}

export class ProfileError extends Error {}

/** The longest a note may be good for: Compass signs them for 48 hours, plus an hour of slack */
export const MAX_LIFETIME_S = 49 * 3600;

const b64 = (s: string) => Buffer.from(s, "base64url");

/** The Compass server we trust, without a trailing slash; null when SigmaRead is not set up for Compass */
export function compassIssuer(env: Record<string, string | undefined> = process.env): string | null {
  const url = (env.COMPASS_ISSUER || env.COMPASS_URL || "").trim().replace(/\/+$/, "");
  return url || null;
}

/**
 * Checks a note and returns its claims, or throws ProfileError.
 * `keys` is the issuer's JSON Web Key Set; `now` is in seconds.
 */
export function verifyProfileNote(
  note: string,
  opts: { issuer: string; keys: Jwk[]; audience?: string; now?: number },
): CompassProfileClaims {
  const parts = note.split(".");
  if (parts.length !== 3) throw new ProfileError("not a signed note");
  const [h, p, s] = parts;

  let header: { alg?: string; kid?: string };
  let claims: CompassProfileClaims;
  try {
    header = JSON.parse(b64(h).toString("utf8"));
    claims = JSON.parse(b64(p).toString("utf8"));
  } catch {
    throw new ProfileError("unreadable note");
  }
  if (!header || typeof header !== "object" || !claims || typeof claims !== "object") throw new ProfileError("unreadable note");
  if (header.alg !== "EdDSA") throw new ProfileError("unexpected algorithm");
  if (typeof header.kid !== "string") throw new ProfileError("unknown key");

  const jwk = opts.keys.find((k) => k.kid === header.kid && k.kty === "OKP" && k.crv === "Ed25519");
  if (!jwk) throw new ProfileError("unknown key");
  const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: jwk.x }, format: "jwk" });
  if (!verify(null, Buffer.from(`${h}.${p}`), key, b64(s))) throw new ProfileError("bad signature");

  const issuer = opts.issuer.replace(/\/+$/, "");
  if (typeof claims.iss !== "string" || claims.iss.replace(/\/+$/, "") !== issuer) throw new ProfileError("wrong issuer");
  if (claims.aud !== (opts.audience ?? COMPASS_APP_SLUG)) throw new ProfileError("note is for another app");
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp <= now) throw new ProfileError("note has expired");
  // Compass's notes are good for 48 hours (contract 1.1); anything longer, or signed in the future, is refused
  if (typeof claims.iat !== "number" || claims.iat > now + 300 || claims.exp - claims.iat > MAX_LIFETIME_S) throw new ProfileError("note lifetime out of range");
  if (typeof claims.sub !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claims.sub)) throw new ProfileError("no student id");
  if (!claims.student || typeof claims.student !== "object") throw new ProfileError("no student");
  return claims;
}

/**
 * Compass's keys, cached for up to an hour. A note naming a key we do not hold fetches them
 * again, but at most once a minute and one fetch at a time: the route is open to anyone, so a
 * stream of made-up key ids must not turn into a stream of calls to Compass.
 */
let cache: { base: string; keys: Jwk[]; at: number } | null = null;
let lastTry = 0;
let inFlight: Promise<Jwk[]> | null = null;

export async function compassKeys(base: string, kid?: string): Promise<Jwk[]> {
  const held = cache && cache.base === base ? cache : null;
  const fresh = held && Date.now() - held.at < 3600_000;
  if (held && fresh && (!kid || held.keys.some((k) => k.kid === kid))) return held.keys;
  // At most one try a minute, failed tries included; meanwhile what we hold still checks known keys
  if (held && Date.now() - lastTry < 60_000) return held.keys;
  if (!inFlight) {
    lastTry = Date.now();
    inFlight = (async () => {
      try {
        const res = await fetch(`${base}/.well-known/jwks.json`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
        if (!res.ok) throw new ProfileError(`keys unavailable (${res.status})`);
        const body = (await res.json()) as { keys?: Jwk[] };
        cache = { base, keys: body.keys ?? [], at: Date.now() };
        return cache.keys;
      } catch (e) {
        if (held) return held.keys; // Compass's key page is down: keep using the keys we have
        throw e;
      }
    })().finally(() => { inFlight = null; });
  }
  return inFlight;
}

/** Where Compass publishes its keys: COMPASS_URL, without a trailing slash */
export function compassBase(env: Record<string, string | undefined> = process.env): string | null {
  const url = (env.COMPASS_URL || "").trim().replace(/\/+$/, "");
  return url || null;
}

/** The `kid` a note names, without checking anything, so the right keys can be fetched */
export function noteKid(note: string): string | undefined {
  try {
    return JSON.parse(b64(note.split(".")[0]).toString("utf8")).kid;
  } catch {
    return undefined;
  }
}

/** Compass sends grade as text ("5", "K"); SigmaRead keeps a number, K as 0 */
export function gradeFromNote(grade: string | undefined): number | null {
  if (!grade) return null;
  if (/^k$/i.test(grade.trim())) return 0;
  const n = parseInt(grade, 10);
  return Number.isFinite(n) && n >= 0 && n <= 12 ? n : null;
}
