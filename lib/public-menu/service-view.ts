/**
 * Faz 2.3: müşteri menüsünde zamanlamanın görünüme çevrilmesi.
 * Saf fonksiyonlar (React'siz) → test edilebilir. Karar: zaman dışında içerik varsayılan
 * olarak görünür kalır ("Şu an servis dışı" notuyla); yalnızca işletme "gizle" derse saklanır.
 */

import type { PublicMenuCollection, PublicMenuPicker } from "@/lib/public-menu/menu-collections";
import {
  describeOutside,
  resolveService,
  type Schedule,
  type ServiceResolution,
} from "@/lib/public-menu/schedule";

type Scheduled = { schedule?: Schedule | null };

/** "Gizle" modunda zaman dışındaki menüler seçim listesinden çıkar. */
export function visibleMenuCollections(
  collections: PublicMenuCollection[],
  now: Date
): PublicMenuCollection[] {
  return collections.filter(
    (menu) => resolveService([{ level: "menu", schedule: menu.schedule ?? null }], now).visible
  );
}

/**
 * Sunucudaki `menu_picker` aktif menü sayısına göre hesaplanır; "gizle" ile görünen menü sayısı
 * değişebileceği için seçim ekranı kararı burada yeniden verilir.
 * Görünen menü kalmadıysa varsayılan menü korunur (filtre uygulanır, başka menünün ürünleri sızmaz).
 */
export function effectiveMenuPicker(
  picker: PublicMenuPicker | null,
  visible: PublicMenuCollection[]
): PublicMenuPicker | null {
  if (!picker) return null;
  return {
    enabled: visible.length >= 2,
    default_menu_collection_id: visible[0]?.id ?? picker.default_menu_collection_id,
  };
}

export function resolveCategoryService(
  category: Scheduled | undefined,
  menu: Scheduled | null | undefined,
  now: Date
): ServiceResolution {
  return resolveService(
    [
      { level: "menu", schedule: menu?.schedule ?? null },
      { level: "category", schedule: category?.schedule ?? null },
    ],
    now
  );
}

export function resolveProductService(
  product: Scheduled,
  category: Scheduled | undefined,
  menu: Scheduled | null | undefined,
  now: Date
): ServiceResolution {
  return resolveService(
    [
      { level: "menu", schedule: menu?.schedule ?? null },
      { level: "category", schedule: category?.schedule ?? null },
      { level: "product", schedule: product.schedule ?? null },
    ],
    now
  );
}

/** Servis dışıysa müşteriye gösterilecek kısa not; değilse null. */
export function serviceNote(resolution: ServiceResolution, language: string, now: Date): string | null {
  if (!resolution.visible || !resolution.outside) return null;
  return describeOutside(resolution.outside.state, language, now);
}

/** Menü seçim ekranı kartları için: menü id → not (yalnızca servis dışı olanlar). */
export function menuServiceNotes(
  collections: PublicMenuCollection[],
  language: string,
  now: Date
): Record<string, string> {
  const notes: Record<string, string> = {};
  for (const menu of collections) {
    const note = serviceNote(
      resolveService([{ level: "menu", schedule: menu.schedule ?? null }], now),
      language,
      now
    );
    if (note) notes[menu.id] = note;
  }
  return notes;
}
