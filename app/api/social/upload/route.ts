import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { getSupabaseAdminClient, getSupabaseBucketName } from "@/lib/supabase";

// Upload your own photo or video as a draft post (instead of, or alongside, an AI image).
// Stores the file in the public bucket under social/uploads/ and creates a draft.

const MAX_BYTES = 200 * 1024 * 1024; // 200 MB

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export async function POST(request: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  const contentType = file.type || "application/octet-stream";
  const isImage = contentType.startsWith("image/");
  const isVideo = contentType.startsWith("video/");
  if (!isImage && !isVideo) {
    return NextResponse.json({ error: "Only image or video files are supported." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is too large (200 MB max)." }, { status: 400 });
  }

  const caption = (form?.get("caption") as string | null)?.slice(0, 5000) ?? "";
  const prompt = (form?.get("prompt") as string | null)?.slice(0, 2000) || "Uploaded media";

  const supabase = getSupabaseAdminClient();
  const bucket = getSupabaseBucketName();
  const ext = EXT_BY_TYPE[contentType] || (isVideo ? "mp4" : "jpg");
  const path = `social/uploads/${crypto.randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, bytes, { contentType, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: created, error: insertError } = await supabase
    .schema("socialsync")
    .from("social_posts")
    .insert({
      prompt,
      caption,
      image_path: isImage ? path : null,
      video_path: isVideo ? path : null,
      status: "draft",
    })
    .select("id, prompt, caption, status, created_at")
    .single();

  if (insertError || !created) {
    return NextResponse.json({ error: insertError?.message ?? "Unable to save draft." }, { status: 500 });
  }

  const publicUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  return NextResponse.json({
    ok: true,
    post: {
      id: created.id,
      prompt: created.prompt,
      caption: created.caption,
      imageUrl: isImage ? publicUrl : null,
      videoUrl: isVideo ? publicUrl : null,
      status: created.status,
      createdAt: created.created_at,
    },
  });
}
