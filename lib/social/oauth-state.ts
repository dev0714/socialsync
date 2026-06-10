import crypto from "node:crypto";

// Signed, expiring OAuth `state` parameter — protects the connect/callback flow
// against CSRF and carries the initiating admin's user id.

type StatePayload = {
  provider: string;
  uid: string;
  n: string;
  exp: number;
};

function getSecret(): string {
  return (
    process.env.SOCIAL_TOKEN_SECRET ||
    process.env.SESSION_SECRET ||
    "meankat-social-oauth-state-v1"
  );
}

export function createState(data: { provider: string; uid: string }): string {
  const payload: StatePayload = {
    ...data,
    n: crypto.randomBytes(8).toString("hex"),
    exp: Date.now() + 10 * 60 * 1000, // 10 minutes
  };
  const json = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", getSecret()).update(json).digest("base64url");
  return `${json}.${sig}`;
}

export function verifyState(token: string | null): StatePayload | null {
  if (!token) return null;
  const [json, sig] = token.split(".");
  if (!json || !sig) return null;

  const expected = crypto.createHmac("sha256", getSecret()).update(json).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(json, "base64url").toString("utf8")) as StatePayload;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
