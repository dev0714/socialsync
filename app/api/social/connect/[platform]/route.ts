import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { PROVIDERS, getRedirectUri, isProvider } from "@/lib/social";
import { createState } from "@/lib/social/oauth-state";

type RouteContext = { params: Promise<{ platform: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { platform } = await params;
  if (!isProvider(platform)) return NextResponse.json({ error: "Unknown provider." }, { status: 400 });

  const provider = PROVIDERS[platform]!;
  const base = (process.env.APP_BASE_URL || new URL(request.url).origin).replace(/\/$/, "");
  if (!provider.isConfigured()) {
    return NextResponse.redirect(`${base}/?social_error=${platform}_not_configured`);
  }

  const state = createState({ provider: platform, uid: "operator" });

  // PKCE providers (X): generate a verifier, stash it in an httpOnly cookie, and send
  // the derived challenge in the authorize URL. The callback reads the verifier back.
  let codeChallenge: string | undefined;
  let codeVerifier: string | undefined;
  if (provider.usesPkce) {
    codeVerifier = crypto.randomBytes(32).toString("base64url");
    codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  }

  const res = NextResponse.redirect(provider.connectUrl(state, getRedirectUri(platform), codeChallenge));
  if (codeVerifier) {
    res.cookies.set(`pkce_${platform}`, codeVerifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
  }
  return res;
}
