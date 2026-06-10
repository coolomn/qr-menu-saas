import { NextResponse } from "next/server";
import {
  isEmailIdentifier,
  isValidLoginUsername,
  normalizeLoginUsername,
} from "@/lib/admin-auth/login-username";
import { resolveOwnerEmailByLoginUsername } from "@/lib/admin-auth/resolve-owner-email-by-username";
import { tryCreateServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Body = {
  username?: string;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const raw = typeof body.username === "string" ? body.username.trim() : "";
  if (!raw || isEmailIdentifier(raw)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const username = normalizeLoginUsername(raw);
  if (!isValidLoginUsername(username)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const svc = tryCreateServiceSupabase();
  if (!svc.ok) {
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }

  const email = await resolveOwnerEmailByLoginUsername(svc.client, username);
  if (!email) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ email });
}
