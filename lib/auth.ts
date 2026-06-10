import crypto from "node:crypto";
import { cookies } from "next/headers";

// Minimal single-operator auth: sign in with SOCIALSYNC_PASSWORD, which sets a
// signed, expiring session cookie. No user table — this is a single-owner tool.

export const SESSION_COOKIE = "socialsync_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secret(): string {
  return (
    process.env.SOCIALSYNC_SESSION_SECRET ||
    process.env.SOCIAL_TOKEN_SECRET ||
    "socialsync-dev-secret-change-me"
  );
}

function sign(value: string): string {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createSessionToken(): string {
  const payload = { exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS };
  const json = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${json}.${sign(json)}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const [json, sig] = token.split(".");
  if (!json || !sig) return false;
  const expected = sign(json);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const payload = JSON.parse(Buffer.from(json, "base64url").toString("utf8"));
    return typeof payload.exp === "number" && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function checkPassword(password: string): boolean {
  const expected = process.env.SOCIALSYNC_PASSWORD;
  if (!expected || !password) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function isAuthed(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export const MAX_AGE = MAX_AGE_SECONDS;
