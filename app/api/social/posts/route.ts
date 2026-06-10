import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { getSupabaseAdminClient, getSupabaseBucketName } from "@/lib/supabase";

export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();
  const bucket = getSupabaseBucketName();
  const { data, error } = await supabase
    .schema("socialsync")
    .from("social_posts")
    .select("id, prompt, caption, image_path, status, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const posts = data ?? [];
  const ids = posts.map((p) => p.id);
  const targetsByPost: Record<string, Array<{ platform: string; status: string; remoteUrl: string | null; error: string | null }>> = {};
  if (ids.length > 0) {
    const { data: targets } = await supabase
      .schema("socialsync")
      .from("social_post_targets")
      .select("post_id, platform, status, remote_url, error")
      .in("post_id", ids);
    for (const t of targets ?? []) {
      (targetsByPost[t.post_id] ||= []).push({
        platform: t.platform,
        status: t.status,
        remoteUrl: t.remote_url,
        error: t.error,
      });
    }
  }

  const result = posts.map((post) => ({
    id: post.id,
    prompt: post.prompt,
    caption: post.caption,
    status: post.status,
    createdAt: post.created_at,
    imageUrl: post.image_path
      ? supabase.storage.from(bucket).getPublicUrl(post.image_path).data.publicUrl
      : null,
    targets: targetsByPost[post.id] ?? [],
  }));

  return NextResponse.json(result);
}
