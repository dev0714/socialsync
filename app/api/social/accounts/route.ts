import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { getSupabaseAdminClient } from "@/lib/supabase";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .schema("socialsync")
    .from("social_accounts")
    .select("id, platform, display_name, external_id, token_expires_at, created_at")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const accounts = (data ?? []).map((a) => ({
    id: a.id,
    platform: a.platform,
    displayName: a.display_name,
    externalId: a.external_id,
    tokenExpiresAt: a.token_expires_at,
    createdAt: a.created_at,
  }));
  return NextResponse.json(accounts);
}
