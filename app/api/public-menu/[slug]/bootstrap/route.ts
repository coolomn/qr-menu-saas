import { NextResponse } from "next/server";
import { PUBLIC_MENU_UNAVAILABLE_MESSAGE } from "@/lib/public-menu/subscription-gate";
import {
  buildPublicMenuBootstrap,
  isRestaurantAccessBlocked,
  loadPublicMenuRestaurantBySlug,
  PUBLIC_MENU_NO_STORE_HEADERS,
} from "@/lib/public-menu/load-public-menu";
import { tryCreateServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) {
    return NextResponse.json({ error: "Slug zorunlu." }, { status: 400 });
  }

  const svc = tryCreateServiceSupabase();
  if (!svc.ok) {
    return NextResponse.json({ error: svc.error }, { status: 503 });
  }

  const loaded = await loadPublicMenuRestaurantBySlug(svc.client, normalizedSlug);
  if (!loaded.ok) {
    if (loaded.kind === "not_found") {
      return NextResponse.json({ error: "Restoran bulunamadı." }, { status: 404 });
    }
    if (loaded.kind === "invalid_shape") {
      console.error("Unexpected restaurant row shape", loaded.error);
      return NextResponse.json({ error: "Menü okunamadı." }, { status: 500 });
    }
    console.error(loaded.error);
    return NextResponse.json({ error: "Menü okunamadı." }, { status: 500 });
  }

  if (isRestaurantAccessBlocked(loaded.restaurant, loaded.gateColumnsAvailable)) {
    return NextResponse.json({ error: PUBLIC_MENU_UNAVAILABLE_MESSAGE }, { status: 403 });
  }

  try {
    const payload = await buildPublicMenuBootstrap(svc.client, loaded.restaurant);
    return NextResponse.json(payload, { headers: PUBLIC_MENU_NO_STORE_HEADERS });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Menü okunamadı." }, { status: 500 });
  }
}
