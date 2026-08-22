import { NextResponse } from "next/server";
import { publicMenuCacheHeadersForStatus } from "@/lib/public-menu/cache-headers";

export function publicMenuJsonResponse<T>(body: T, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: publicMenuCacheHeadersForStatus(status),
  });
}
