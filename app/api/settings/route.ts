import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthed } from "@/lib/auth";
import { getSettingsView, saveSettings } from "@/lib/settings";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getSettingsView());
}

const bodySchema = z.object({ values: z.record(z.string(), z.string()) });

export async function POST(request: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid settings payload." }, { status: 400 });

  try {
    await saveSettings(parsed.data.values);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save settings." },
      { status: 500 },
    );
  }
}
