"use client";

import { useProductExtras } from "@/app/menu/[slug]/_components/product-extras-context";
import { PublicMenuPrice } from "@/app/menu/[slug]/_components/public-menu-price";
import {
  describeSelectionRule,
  formatPriceDelta,
  modifierText,
} from "@/lib/public-menu/product-extras";
import { variantPriceRangeRaw } from "@/lib/public-menu/menu-filters";
import { hasProductVariants, type PublicProduct } from "@/lib/public-menu/product-variants";
import { resolvePublicProductCardImageSrc } from "@/lib/public-menu/product-image-urls";
import type { ResolvedMenuPresentation } from "@/lib/public-menu/themes/resolve";
import { pickLang } from "@/lib/public-menu/venue-info";

type Props = {
  product: PublicProduct;
  theme: ResolvedMenuPresentation;
  getText: (item: Record<string, unknown>, field: string) => string;
  language: string;
  /** Menüdeki pencerede: önerilen ürüne dokununca pencere o ürünü gösterir. */
  onOpenPairing?: (product: PublicProduct) => void;
  /** Ürün sayfasında: önerilen ürünün adresi. */
  pairingHref?: (productId: string) => string;
};

/** Faz 2.4: seçenek grupları, çıkarılabilir malzemeler, "yanında iyi gider" (yalnız bilgi). */
export function ProductDetailExtras({ product, theme, getText, language, onOpenPairing, pairingHref }: Props) {
  const ctx = useProductExtras();
  const c = theme.classes;

  const groups = (product.modifier_group_ids ?? [])
    .map((id) => ctx?.groupsById.get(id))
    .filter((g): g is NonNullable<typeof g> => Boolean(g));
  const ingredients = product.removable_ingredients ?? [];
  const pairings = (product.pairing_ids ?? [])
    .map((id) => ctx?.productsById.get(id))
    .filter((p): p is PublicProduct => Boolean(p));

  if (groups.length === 0 && ingredients.length === 0 && pairings.length === 0) return null;

  const sectionTitle = `${c.allergenLabel} normal-case tracking-wide text-[11px]`;

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.id} aria-label={modifierText(language, group)}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <h3 className={`${c.fontBody} text-sm font-bold`}>{modifierText(language, group)}</h3>
            <span className={sectionTitle}>{describeSelectionRule(group, language)}</span>
          </div>
          <ul className={c.variantList}>
            {group.options.map((option) => {
              const delta = formatPriceDelta(option.price_delta);
              return (
                <li key={option.id} className={c.variantItem}>
                  <span className={c.variantLabel}>
                    {modifierText(language, option)}
                    {option.calories != null ? (
                      <span className="ml-1.5 text-[10px] font-medium opacity-60">{option.calories} kcal</span>
                    ) : null}
                  </span>
                  {delta ? (
                    <span className="shrink-0 text-xs font-bold" style={{ color: theme.priceColor }}>
                      {delta}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {ingredients.length > 0 && (
        <section>
          <h3 className={`${c.fontBody} mb-1.5 text-sm font-bold`}>
            {pickLang(language, {
              tr: "Çıkarılabilir malzemeler",
              en: "Can be removed",
              ru: "Можно убрать",
            })}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {ingredients.map((item) => (
              <span
                key={item.name}
                className="rounded-full border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-800"
              >
                {modifierText(language, item)}
              </span>
            ))}
          </div>
          <p className={`${c.productDescription} mt-1.5 text-xs`}>
            {pickLang(language, {
              tr: "İstemediğiniz malzemeyi sipariş verirken belirtin.",
              en: "Let us know what to leave out when you order.",
              ru: "Сообщите при заказе, что убрать.",
            })}
          </p>
        </section>
      )}

      {pairings.length > 0 && (
        <section>
          <h3 className={`${c.fontBody} mb-2 text-sm font-bold`}>
            {pickLang(language, { tr: "Yanında iyi gider", en: "Goes well with", ru: "Хорошо сочетается с" })}
          </h3>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {pairings.map((pairing, _i, all) => {
              // Hiçbirinde fotoğraf yoksa boş gri kutular yerine sade kart.
              const anyImage = all.some((p) => Boolean(resolvePublicProductCardImageSrc(p)));
              const record = pairing as unknown as Record<string, unknown>;
              const name = getText(record, "name");
              const img = resolvePublicProductCardImageSrc(pairing);
              // Boyutlu üründe en düşük fiyat gösterilir.
              const price = hasProductVariants(pairing.variants ?? [])
                ? variantPriceRangeRaw(pairing)?.min ?? null
                : pairing.price;
              const inner = (
                <>
                  {anyImage && (
                    <div className="aspect-square w-full overflow-hidden rounded-xl bg-gray-100">
                      {img ? (
                        <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" draggable={false} />
                      ) : null}
                    </div>
                  )}
                  <span className={`${c.fontBody} mt-1.5 line-clamp-2 text-xs font-semibold leading-tight`}>
                    {name}
                  </span>
                  {price ? (
                    <span className="mt-0.5">
                      <PublicMenuPrice raw={price} theme={theme} size="variant" />
                    </span>
                  ) : null}
                </>
              );
              const cls = `flex w-[6.5rem] shrink-0 flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-xl ${
                anyImage ? "" : "border border-gray-200 bg-white/60 p-2.5 [&>span:first-child]:mt-0"
              }`;
              if (onOpenPairing) {
                return (
                  <button key={pairing.id} type="button" className={cls} onClick={() => onOpenPairing(pairing)}>
                    {inner}
                  </button>
                );
              }
              if (pairingHref) {
                return (
                  <a key={pairing.id} href={pairingHref(pairing.id)} className={cls}>
                    {inner}
                  </a>
                );
              }
              return (
                <div key={pairing.id} className={cls}>
                  {inner}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
