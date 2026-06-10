import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthed } from "@/lib/auth";
import { getSupabaseAdminClient, getSupabaseBucketName } from "@/lib/supabase";

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z.object({ caption: z.string().max(5000) });

export async function PATCH(request: Request, { params }: RouteContext) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const postId = id?.trim();
  if (!postId) return NextResponse.json({ error: "Missing post id." }, { status: 400 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid caption." }, { status: 400 });

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .schema("socialsync")
    .from("social_posts")
    .update({ caption: parsed.data.caption, updated_at: new Date().toISOString() })
    .eq("id", postId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const postId = id?.trim();
  if (!postId) return NextResponse.json({ error: "Missing post id." }, { status: 400 });

  const supabase = getSupabaseAdminClient();
  const bucket = getSupabaseBucketName();

  const { data: existing } = await supabase
    .schema("socialsync")
    .from("social_posts")
    .select("image_path")
    .eq("id", postId)
    .maybeSingle();

  if (existing?.image_path) {
    await supabase.storage.from(bucket).remove([existing.image_path]);
  }

  const { error } = await supabase.schema("socialsync").from("social_posts").delete().eq("id", postId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
