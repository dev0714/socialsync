import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { publishPostToAccounts } from "@/lib/social/publish";
import { isCronAuthorized } from "@/lib/cron";

// Publishes scheduled posts whose time has come. Wired to a Vercel Cron (see vercel.json).
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: due, error } = await supabase
    .schema("socialsync")
    .from("social_posts")
    .select("id, scheduled_account_ids")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .limit(25);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const post of due ?? []) {
    const accountIds: string[] = post.scheduled_account_ids ?? [];
    if (accountIds.length === 0) {
      // Nothing to publish to — mark failed so it isn't retried forever.
      await supabase
        .schema("socialsync")
        .from("social_posts")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", post.id);
      results.push({ id: post.id, ok: false, error: "No target accounts." });
      continue;
    }
    try {
      const outcome = await publishPostToAccounts(post.id, accountIds);
      results.push({ id: post.id, ok: outcome.ok });
    } catch (e) {
      results.push({ id: post.id, ok: false, error: e instanceof Error ? e.message : "failed" });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
