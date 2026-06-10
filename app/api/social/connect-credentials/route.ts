import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthed } from "@/lib/auth";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { encryptToken } from "@/lib/social/crypto";
import { CREDENTIAL_PROVIDERS, isCredentialProvider } from "@/lib/social";

// Lists the credential-based providers and the fields their connect form needs.
export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const providers = Object.values(CREDENTIAL_PROVIDERS).map((p) => ({
    provider: p!.provider,
    fields: p!.fields,
  }));
  return NextResponse.json(providers);
}

const bodySchema = z.object({
  provider: z.string(),
  values: z.record(z.string(), z.string()),
});

export async function POST(request: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isCredentialProvider(parsed.data.provider)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const provider = CREDENTIAL_PROVIDERS[parsed.data.provider]!;
  try {
    const discovered = await provider.connect(parsed.data.values);
    if (discovered.length === 0) return NextResponse.json({ error: "No account found." }, { status: 400 });

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

    const { error } = await supabase
      .schema("socialsync")
      .from("social_accounts")
      .upsert(rows, { onConflict: "platform,external_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, connected: provider.provider });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Connection failed." },
      { status: 400 },
    );
  }
}
