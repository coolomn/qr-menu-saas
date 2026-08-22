import { PUBLIC_MENU_UNAVAILABLE_MESSAGE } from "@/lib/public-menu/subscription-gate";
import {
  buildPublicMenuFull,
  isRestaurantAccessBlocked,
  loadPublicMenuRestaurantBySlug,
} from "@/lib/public-menu/load-public-menu";
import { publicMenuJsonResponse } from "@/lib/public-menu/public-menu-route-response";
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
    return publicMenuJsonResponse({ error: "Slug zorunlu." }, 400);
  }

  const svc = tryCreateServiceSupabase();
  if (!svc.ok) {
    return publicMenuJsonResponse({ error: svc.error }, 503);
  }

  const loaded = await loadPublicMenuRestaurantBySlug(svc.client, normalizedSlug);
  if (!loaded.ok) {
    if (loaded.kind === "not_found") {
      return publicMenuJsonResponse({ error: "Restoran bulunamadı." }, 404);
    }
    if (loaded.kind === "invalid_shape") {
      console.error("Unexpected restaurant row shape", loaded.error);
      return publicMenuJsonResponse({ error: "Menü okunamadı." }, 500);
    }
    console.error(loaded.error);
    return publicMenuJsonResponse({ error: "Menü okunamadı." }, 500);
  }

  if (isRestaurantAccessBlocked(loaded.restaurant, loaded.gateColumnsAvailable)) {
    return publicMenuJsonResponse({ error: PUBLIC_MENU_UNAVAILABLE_MESSAGE }, 403);
  }

  try {
    const payload = await buildPublicMenuFull(svc.client, loaded.restaurant);
    return publicMenuJsonResponse(payload, 200);
  } catch (error) {
    console.error(error);
    return publicMenuJsonResponse({ error: "Menü okunamadı." }, 500);
  }
}
