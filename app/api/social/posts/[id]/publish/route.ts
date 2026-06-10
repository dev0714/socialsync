import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthed } from "@/lib/auth";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { publishPostToAccounts } from "@/lib/social/publish";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  accountIds: z.array(z.string().uuid()).min(1),
  // When set to a future time, the post is queued instead of published now.
  scheduledAt: z.string().datetime().optional(),
});

export async function POST(request: Request, { params }: RouteContext) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const postId = id?.trim();
  if (!postId) return NextResponse.json({ error: "Missing post id." }, { status: 400 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Select at least one connected account." }, { status: 400 });
  }

  const { accountIds, scheduledAt } = parsed.data;

  // Schedule for later: store the time + target accounts; the cron publishes when due.
  if (scheduledAt && new Date(scheduledAt).getTime() > Date.now() + 30_000) {
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase
      .schema("socialsync")
      .from("social_posts")
      .update({
        status: "scheduled",
        scheduled_at: scheduledAt,
        scheduled_account_ids: accountIds,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, scheduled: true, scheduledAt });
  }

  try {
    const outcome = await publishPostToAccounts(postId, accountIds);
    return NextResponse.json(outcome);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Publish failed.";
    const status = message === "Post not found." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
