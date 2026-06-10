import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { PUBLISHERS, ensureFreshToken, loadAccountsByIds } from "@/lib/social";
import { recomputePostStatus } from "@/lib/social/publish";
import { isCronAuthorized } from "@/lib/cron";

// Polls async platform uploads (TikTok publish_id, YouTube processing) for their final
// state and updates the target rows. Wired to a Vercel Cron (see vercel.json).
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: targets, error } = await supabase
    .schema("socialsync")
    .from("social_post_targets")
    .select("id, post_id, platform, account_id, remote_id")
    .eq("status", "processing")
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const pending = (targets ?? []).filter((t) => t.account_id && t.remote_id);
  const accounts = await loadAccountsByIds(
    Array.from(new Set(pending.map((t) => t.account_id as string))),
  );
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const affectedPosts = new Set<string>();
  let resolved = 0;

  for (const target of pending) {
    const publisher = PUBLISHERS[target.platform as keyof typeof PUBLISHERS];
    const account = accountById.get(target.account_id as string);
    if (!publisher?.checkStatus || !account) continue;

    affectedPosts.add(target.post_id);
    try {
      const fresh = await ensureFreshToken(account);
      const result = await publisher.checkStatus(target.remote_id as string, fresh);
      if (result.status === "processing") continue; // still pending; check again next run

      await supabase
        .schema("socialsync")
        .from("social_post_targets")
        .update({
          status: "published",
          remote_url: result.remoteUrl,
          posted_at: new Date().toISOString(),
        })
        .eq("id", target.id);
      resolved++;
    } catch (e) {
      await supabase
        .schema("socialsync")
        .from("social_post_targets")
        .update({
          status: "failed",
          error: (e instanceof Error ? e.message : "Polling failed.").slice(0, 500),
        })
        .eq("id", target.id);
      resolved++;
    }
  }

  for (const postId of affectedPosts) {
    await recomputePostStatus(postId);
  }

  return NextResponse.json({ ok: true, checked: pending.length, resolved });
}
