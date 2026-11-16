import { cache } from "react";
import { tryCreateServiceSupabase } from "@/lib/supabase/service";
import {
  buildPublicMenuFull,
  isRestaurantAccessBlocked,
  loadPublicMenuRestaurantBySlug,
  type PublicCategoryPayload,
  type PublicRestaurantPayload,
} from "@/lib/public-menu/load-public-menu";
import { normalizePublicProduct, type PublicProduct } from "@/lib/public-menu/product-variants";
import type { PublicModifierGroup } from "@/lib/public-menu/product-extras";

export type PublicProductPageData = {
  restaurant: PublicRestaurantPayload;
  category: PublicCategoryPayload | null;
  product: PublicProduct;
  /** Faz 2.4: ürüne bağlı seçenek grupları ve önerilen ürünler (yalnız bu ürün için). */
  modifierGroups: PublicModifierGroup[];
  pairingProducts: PublicProduct[];
};

export type LoadPublicProductResult =
  | { ok: true; data: PublicProductPageData }
  | { ok: false; reason: "not_found" | "unavailable" | "error" };

/**
 * Ürün detay sayfası için sunucu tarafı okuma (service role): menü API'siyle aynı kurallar —
 * süresi dolmuş/askıdaki restoran kapalı, yalnızca aktif ürünler görünür.
 * React cache: aynı istekte generateMetadata ve sayfa tek sorguyu paylaşır.
 */
export const loadPublicProduct = cache(
  async (slug: string, productId: string): Promise<LoadPublicProductResult> => {
    const normalizedSlug = slug.trim();
    const normalizedId = productId.trim();
    if (!normalizedSlug || !normalizedId) return { ok: false, reason: "not_found" };

    const svc = tryCreateServiceSupabase();
    if (!svc.ok) return { ok: false, reason: "error" };

    const loaded = await loadPublicMenuRestaurantBySlug(svc.client, normalizedSlug);
    if (!loaded.ok) {
      return { ok: false, reason: loaded.kind === "not_found" ? "not_found" : "error" };
    }
    if (isRestaurantAccessBlocked(loaded.restaurant, loaded.gateColumnsAvailable)) {
      return { ok: false, reason: "unavailable" };
    }

    try {
      const full = await buildPublicMenuFull(svc.client, loaded.restaurant);
      const found = full.products.find((p) => p.id === normalizedId);
      const product = found ? normalizePublicProduct(found) : null;
      if (!product) return { ok: false, reason: "not_found" };
      const category = full.categories.find((c) => c.id === product.category_id) ?? null;
      const groupIds = new Set(product.modifier_group_ids ?? []);
      const modifierGroups = (full.modifier_groups ?? []).filter((g) => groupIds.has(g.id));
      const pairingProducts = (product.pairing_ids ?? [])
        .map((id) => full.products.find((p) => p.id === id))
        .map((p) => (p ? normalizePublicProduct(p) : null))
        .filter((p): p is PublicProduct => p !== null);
      return {
        ok: true,
        data: { restaurant: full.restaurant, category, product, modifierGroups, pairingProducts },
      };
    } catch (error) {
      console.error(error);
      return { ok: false, reason: "error" };
    }
  }
);
