import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";

export async function GET() {
  return NextResponse.json({ authed: await isAuthed() });
}
