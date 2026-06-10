import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthed } from "@/lib/auth";
import { getSupabaseAdminClient, getSupabaseBucketName } from "@/lib/supabase";
import { generateCaption } from "@/lib/ai/caption";
import { generateImage } from "@/lib/ai/image";

const bodySchema = z.object({
  prompt: z.string().min(3).max(2000),
  tone: z.string().max(120).optional(),
  platforms: z.array(z.string()).optional(),
});

export async function POST(request: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Please provide a description of at least a few words." }, { status: 400 });
  }

  let caption = "";
  let hashtags: string[] = [];
  try {
    const result = await generateCaption(parsed.data);
    caption = result.caption;
    hashtags = result.hashtags;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Caption generation failed." },
      { status: 500 },
    );
  }
  const tags = hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
  const fullCaption = tags ? `${caption}\n\n${tags}` : caption;

  let imagePath: string | null = null;
  let imageUrl: string | null = null;
  try {
    const image = await generateImage({ prompt: parsed.data.prompt });
    const supabase = getSupabaseAdminClient();
    const bucket = getSupabaseBucketName();
    const ext = image.contentType.includes("png") ? "png" : "jpg";
    imagePath = `social/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(imagePath, image.data, { contentType: image.contentType, upsert: false });
    if (uploadError) throw new Error(uploadError.message);
    imageUrl = supabase.storage.from(bucket).getPublicUrl(imagePath).data.publicUrl;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Image generation failed." },
      { status: 500 },
    );
  }

  const supabase = getSupabaseAdminClient();
  const { data: created, error: insertError } = await supabase
    .schema("socialsync")
    .from("social_posts")
    .insert({ prompt: parsed.data.prompt, caption: fullCaption, image_path: imagePath, status: "draft" })
    .select("id, prompt, caption, status, created_at")
    .single();

  if (insertError || !created) {
    return NextResponse.json({ error: insertError?.message ?? "Unable to save draft." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    post: {
      id: created.id,
      prompt: created.prompt,
      caption: created.caption,
      imageUrl,
      status: created.status,
      createdAt: created.created_at,
    },
  });
}
