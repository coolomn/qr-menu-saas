import { NextResponse } from "next/server";
import { requireMasterAdmin } from "@/lib/master-admin/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireMasterAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  return NextResponse.json({
    isMasterAdmin: true,
    userId: auth.user.id,
    email: auth.user.email ?? null,
  });
}
