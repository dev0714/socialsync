import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { PROVIDERS, getRedirectUri, isProvider } from "@/lib/social";
import { createState } from "@/lib/social/oauth-state";

type RouteContext = { params: Promise<{ platform: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { platform } = await params;
  if (!isProvider(platform)) return NextResponse.json({ error: "Unknown provider." }, { status: 400 });

  const provider = PROVIDERS[platform];
  const base = (process.env.APP_BASE_URL || new URL(request.url).origin).replace(/\/$/, "");
  if (!provider.isConfigured()) {
    return NextResponse.redirect(`${base}/?social_error=${platform}_not_configured`);
  }

  const state = createState({ provider: platform, uid: "operator" });
  return NextResponse.redirect(provider.connectUrl(state, getRedirectUri(platform)));
}
