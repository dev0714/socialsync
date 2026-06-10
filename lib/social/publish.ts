import { getSupabaseAdminClient, getSupabaseBucketName } from "@/lib/supabase";
import { PUBLISHERS, ensureFreshToken, loadAccountsByIds } from "./index";
import type { MediaType, PublishPost } from "./types";

export type TargetResult = {
  platform: string;
  status: string;
  remoteUrl: string | null;
  error: string | null;
};

export type PublishOutcome = {
  ok: boolean;
  targets: TargetResult[];
};

// Builds the PublishPost view of a stored post: public URLs + lazy byte fetchers
// for both the generated/uploaded image and an uploaded video.
function buildPublishPost(
  post: { caption: string | null; image_path: string | null; video_path: string | null },
): PublishPost {
  const supabase = getSupabaseAdminClient();
  const bucket = getSupabaseBucketName();

  const imageUrl = post.image_path
    ? supabase.storage.from(bucket).getPublicUrl(post.image_path).data.publicUrl
    : null;
  const videoUrl = post.video_path
    ? supabase.storage.from(bucket).getPublicUrl(post.video_path).data.publicUrl
    : null;

  const mediaType: MediaType = videoUrl ? "video" : "image";

  const download = async (url: string | null, what: string): Promise<Buffer> => {
    if (!url) throw new Error(`No ${what} available for this post.`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download ${what}.`);
    return Buffer.from(await res.arrayBuffer());
  };

  return {
    caption: post.caption ?? "",
    mediaType,
    imageUrl,
    videoUrl,
    imageBytes: () => download(imageUrl, "image"),
    videoBytes: () => download(videoUrl, "video"),
  };
}

// Re-derives a post's status from its target rows. Used after async status polling
// settles in-flight targets. published > publishing (still processing) > failed.
export async function recomputePostStatus(postId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { data: targets } = await supabase
    .schema("socialsync")
    .from("social_post_targets")
    .select("status")
    .eq("post_id", postId);

  const statuses = (targets ?? []).map((t) => t.status);
  if (statuses.length === 0) return;

  const status = statuses.includes("published")
    ? "published"
    : statuses.includes("processing") || statuses.includes("pending")
      ? "publishing"
      : "failed";

  await supabase
    .schema("socialsync")
    .from("social_posts")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", postId);
}

// Core publish fan-out shared by the manual publish route and the scheduler cron.
// Marks the post publishing, attempts each account, records a target row per
// account (with account_id for later polling/retry), and sets the final post status.
export async function publishPostToAccounts(
  postId: string,
  accountIds: string[],
): Promise<PublishOutcome> {
  const supabase = getSupabaseAdminClient();

  const { data: post, error: postError } = await supabase
    .schema("socialsync")
    .from("social_posts")
    .select("id, caption, image_path, video_path")
    .eq("id", postId)
    .maybeSingle();

  if (postError || !post) throw new Error("Post not found.");

  const publishPost = buildPublishPost(post);
  const accounts = await loadAccountsByIds(accountIds);
  if (accounts.length === 0) throw new Error("No matching connected accounts.");

  await supabase
    .schema("socialsync")
    .from("social_posts")
    .update({ status: "publishing", updated_at: new Date().toISOString() })
    .eq("id", postId);

  const targets: TargetResult[] = [];
  let anySuccess = false;
  let anyPending = false;

  for (const account of accounts) {
    const publisher = PUBLISHERS[account.platform];
    try {
      const fresh = await ensureFreshToken(account);
      const result = await publisher.publish(publishPost, fresh);
      const status = result.status === "processing" ? "processing" : "published";
      if (status === "published") anySuccess = true;
      else anyPending = true;
      await supabase.schema("socialsync").from("social_post_targets").insert({
        post_id: postId,
        account_id: account.id,
        platform: account.platform,
        status,
        remote_id: result.remoteId,
        remote_url: result.remoteUrl,
        posted_at: status === "published" ? new Date().toISOString() : null,
      });
      targets.push({ platform: account.platform, status, remoteUrl: result.remoteUrl, error: null });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Publish failed.";
      await supabase.schema("socialsync").from("social_post_targets").insert({
        post_id: postId,
        account_id: account.id,
        platform: account.platform,
        status: "failed",
        error: message.slice(0, 500),
      });
      targets.push({ platform: account.platform, status: "failed", remoteUrl: null, error: message });
    }
  }

  // "published" once anything succeeded; "publishing" while async targets settle;
  // "failed" only when nothing succeeded and nothing is still in flight.
  const finalStatus = anySuccess ? "published" : anyPending ? "publishing" : "failed";
  await supabase
    .schema("socialsync")
    .from("social_posts")
    .update({ status: finalStatus, updated_at: new Date().toISOString() })
    .eq("id", postId);

  return { ok: anySuccess || anyPending, targets };
}
