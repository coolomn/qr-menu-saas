import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** İstemciye sadece isim listesi döner; değerler asla gönderilmez. */
export async function GET() {
  const missing: string[] = [];
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()) {
    missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    missing.push("OPENAI_API_KEY");
  }
  return NextResponse.json({ ok: missing.length === 0, missing });
}
