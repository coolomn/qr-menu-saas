import { cache } from "react";
import { tryCreateServiceSupabase } from "@/lib/supabase/service";
import { isPublicMenuBlocked } from "@/lib/public-menu/subscription-gate";
import { isMissingColumnError } from "./db-errors";

/**
 * Faz 2.11a: menü/ürün sayfalarının arama motoru bilgisi (sunucu tarafı, service role).
 * Kolon eksikse (migration uygulanmadı) kademeli geri dönüş: seo_indexable yoksa "açık" varsayılır.
 */
export type MenuSeoInfo = {
  name: string;
  /** Sahip "Google'da görünsün" dedi mi (varsayılan evet). */
  indexable: boolean;
  /** Süresi dolmuş/askıdaki restoran: menü kapalı → noindex, JSON-LD yok. */
  blocked: boolean;
  logoUrl: string | null;
  instagram: string | null;
  openingHours: unknown;
  socialLinks: unknown;
};

type Row = Record<string, unknown>;

const FULL_COLUMNS =
  "name,seo_indexable,tenant_status,subscription_ends_at,logo_url,instagram,opening_hours,social_links";
const NO_SEO_COLUMNS =
  "name,tenant_status,subscription_ends_at,logo_url,instagram,opening_hours,social_links";

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function toMenuSeoInfo(row: Row): MenuSeoInfo {
  return {
    name: str(row.name) ?? "",
    indexable: row.seo_indexable !== false,
    blocked: isPublicMenuBlocked({
      tenant_status: typeof row.tenant_status === "string" ? row.tenant_status : null,
      subscription_ends_at: typeof row.subscription_ends_at === "string" ? row.subscription_ends_at : null,
    }),
    logoUrl: str(row.logo_url),
    instagram: str(row.instagram),
    openingHours: row.opening_hours ?? null,
    socialLinks: row.social_links ?? null,
  };
}

/**
 * found: kayıt var · not_found: slug yok (doğrulandı) · error: okunamadı (geçici hata/yapılandırma).
 * Hata ile "yok" ayrı tutulur: geçici bir DB hatası canlı menüyü noindex'e çevirmemeli.
 */
export type MenuSeoResult =
  | { status: "found"; info: MenuSeoInfo }
  | { status: "not_found" }
  | { status: "error" };

/** React cache: layout + sayfa aynı istekte tek sorgu. */
export const loadMenuSeo = cache(async (slug: string): Promise<MenuSeoResult> => {
  const normalized = slug.trim();
  if (!normalized) return { status: "not_found" };
  const service = tryCreateServiceSupabase();
  if (!service.ok) return { status: "error" };

  for (const columns of [FULL_COLUMNS, NO_SEO_COLUMNS, "name"]) {
    const { data, error } = await service.client
      .from("restaurants")
      .select(columns)
      .eq("slug", normalized)
      .maybeSingle();
    if (!error) {
      return data ? { status: "found", info: toMenuSeoInfo(data as unknown as Row) } : { status: "not_found" };
    }
    // Yalnız eksik kolon hatasında bir sonraki (daha dar) sorguya düş; başka hata = error.
    if (!isMissingColumnError(error)) {
      console.error("loadMenuSeo:", error.message);
      return { status: "error" };
    }
  }
  return { status: "error" };
});

/** Bulunan restoran için: gizli, askıdaki veya adsız kayıt → görünmez. */
export function isSeoVisible(info: MenuSeoInfo | null): boolean {
  return !!info && info.name !== "" && info.indexable && !info.blocked;
}

/**
 * Sayfa robots kararı. noindex YALNIZ doğrulanmış durumlarda (sahip kapattı, abonelik bitti, kayıt yok);
 * okuma hatasında etiket eklenmez (varsayılan davranış korunur).
 */
export function shouldNoIndex(result: MenuSeoResult): boolean {
  if (result.status === "error") return false;
  if (result.status === "not_found") return true;
  return !isSeoVisible(result.info);
}
