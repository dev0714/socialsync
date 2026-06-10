import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthed } from "@/lib/auth";
import { getSupabaseAdminClient, getSupabaseBucketName } from "@/lib/supabase";
import { PUBLISHERS, ensureFreshToken, loadAccountsByIds } from "@/lib/social";
import type { PublishPost } from "@/lib/social/types";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({ accountIds: z.array(z.string().uuid()).min(1) });

export async function POST(request: Request, { params }: RouteContext) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const postId = id?.trim();
  if (!postId) return NextResponse.json({ error: "Missing post id." }, { status: 400 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Select at least one connected account." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const bucket = getSupabaseBucketName();

  const { data: post, error: postError } = await supabase
    .schema("socialsync")
    .from("social_posts")
    .select("id, caption, image_path")
    .eq("id", postId)
    .maybeSingle();

  if (postError || !post) return NextResponse.json({ error: "Post not found." }, { status: 404 });

  const imageUrl = post.image_path
    ? supabase.storage.from(bucket).getPublicUrl(post.image_path).data.publicUrl
    : null;

  const publishPost: PublishPost = {
    caption: post.caption ?? "",
    imageUrl,
    imageBytes: async () => {
      if (!imageUrl) throw new Error("No image available for this post.");
      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error("Failed to download generated image.");
      return Buffer.from(await res.arrayBuffer());
    },
  };

  const accounts = await loadAccountsByIds(parsed.data.accountIds);
  if (accounts.length === 0) {
    return NextResponse.json({ error: "No matching connected accounts." }, { status: 400 });
  }

  await supabase
    .schema("socialsync")
    .from("social_posts")
    .update({ status: "publishing", updated_at: new Date().toISOString() })
    .eq("id", postId);

  const targets: Array<{ platform: string; status: string; remoteUrl: string | null; error: string | null }> = [];
  let anySuccess = false;

  for (const account of accounts) {
    const publisher = PUBLISHERS[account.platform];
    try {
      const fresh = await ensureFreshToken(account);
      const result = await publisher.publish(publishPost, fresh);
      anySuccess = true;
      await supabase.schema("socialsync").from("social_post_targets").insert({
        post_id: postId,
        platform: account.platform,
        status: "published",
        remote_id: result.remoteId,
        remote_url: result.remoteUrl,
        posted_at: new Date().toISOString(),
      });
      targets.push({ platform: account.platform, status: "published", remoteUrl: result.remoteUrl, error: null });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Publish failed.";
      await supabase.schema("socialsync").from("social_post_targets").insert({
        post_id: postId,
        platform: account.platform,
        status: "failed",
        error: message.slice(0, 500),
      });
      targets.push({ platform: account.platform, status: "failed", remoteUrl: null, error: message });
    }
  }

  await supabase
    .schema("socialsync")
    .from("social_posts")
    .update({ status: anySuccess ? "published" : "failed", updated_at: new Date().toISOString() })
    .eq("id", postId);

  return NextResponse.json({ ok: anySuccess, targets });
}
