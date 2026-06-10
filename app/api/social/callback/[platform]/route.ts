import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { encryptToken } from "@/lib/social/crypto";
import { PROVIDERS, getRedirectUri, isProvider } from "@/lib/social";
import { verifyState } from "@/lib/social/oauth-state";

type RouteContext = { params: Promise<{ platform: string }> };

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export async function GET(request: Request, { params }: RouteContext) {
  const { platform } = await params;
  const url = new URL(request.url);
  const base = (process.env.APP_BASE_URL || url.origin).replace(/\/$/, "");
  const back = (suffix: string) => NextResponse.redirect(`${base}/?${suffix}`);

  const error = url.searchParams.get("error");
  if (error) return back(`social_error=${encodeURIComponent(error)}`);
  if (!isProvider(platform)) return back("social_error=unknown_provider");

  const state = verifyState(url.searchParams.get("state"));
  if (!state || state.provider !== platform) return back("social_error=invalid_state");

  const code = url.searchParams.get("code");
  if (!code) return back("social_error=missing_code");

  try {
    const provider = PROVIDERS[platform]!;
    // PKCE providers read the verifier from the cookie set during connect.
    const codeVerifier = provider.usesPkce
      ? url.searchParams.get("__pkce") || readCookie(request, `pkce_${platform}`)
      : undefined;
    const discovered = await provider.exchangeCode(code, getRedirectUri(platform), codeVerifier ?? undefined);
    if (discovered.length === 0) return back("social_error=no_accounts");

    const supabase = getSupabaseAdminClient();
    const rows = discovered.map((acct) => ({
      platform: acct.platform,
      display_name: acct.displayName,
      external_id: acct.externalId,
      access_token: encryptToken(acct.accessToken),
      refresh_token: acct.refreshToken ? encryptToken(acct.refreshToken) : null,
      token_expires_at: acct.expiresAt ?? null,
      scopes: acct.scopes ?? null,
      meta: acct.meta ?? null,
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await supabase
      .schema("socialsync")
      .from("social_accounts")
      .upsert(rows, { onConflict: "platform,external_id" });

    if (upsertError) return back(`social_error=${encodeURIComponent(upsertError.message)}`);
    const res = back(`connected=${platform}`);
    res.cookies.delete(`pkce_${platform}`);
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "connection_failed";
    return back(`social_error=${encodeURIComponent(message.slice(0, 120))}`);
  }
}
