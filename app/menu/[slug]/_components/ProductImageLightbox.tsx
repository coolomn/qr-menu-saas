"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Link2, X } from "lucide-react";
import {
  hasProductVariants,
  type PublicProduct,
  type PublicProductVariant,
} from "@/lib/public-menu/product-variants";
import { PublicMenuPrice } from "@/app/menu/[slug]/_components/public-menu-price";
import { parsePriceForDisplay } from "@/lib/format-price";
import {
  resolveMenuPresentation,
  type ResolvedMenuPresentation,
} from "@/lib/public-menu/themes/resolve";
import type { ThemeId } from "@/lib/public-menu/themes/ids";
import { PublicProductAllergens } from "@/app/menu/[slug]/_components/public-product-allergens";
import { hasNutrition, pickLang, readNutrition, resolveProductBadges } from "@/lib/public-menu/venue-info";

const OPTIONAL_META_FIELDS = [
  { keys: ["grammage", "gram", "weight", "weight_g", "portion"], label: "Gramaj" },
] as const;

type ProductImageLightboxProps = {
  open: boolean;
  onClose: () => void;
  product: PublicProduct;
  theme: ResolvedMenuPresentation;
  getText: (item: Record<string, unknown>, field: string) => string;
  language?: string;
  shareUrl?: string;
};

function getVariantLabel(variant: PublicProductVariant, language: string): string {
  const pick = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  if (language === "en") {
    const en = pick(variant.label_en);
    if (en) return en;
  }
  if (language === "ru") {
    const ru = pick(variant.label_ru);
    if (ru) return ru;
  }
  return pick(variant.label) || variant.label;
}

function readOptionalMeta(record: Record<string, unknown>): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const field of OPTIONAL_META_FIELDS) {
    for (const key of field.keys) {
      const raw = record[key];
      if (typeof raw === "string" && raw.trim()) {
        out.push({ label: field.label, value: raw.trim() });
        break;
      }
      if (typeof raw === "number" && Number.isFinite(raw)) {
        out.push({ label: field.label, value: String(raw) });
        break;
      }
    }
  }
  return out;
}

export function lightboxCardClasses(appearance: ThemeId): string {
  if (appearance === "dark") {
    return "bg-zinc-900 text-zinc-100 shadow-2xl shadow-black/50 ring-1 ring-zinc-800";
  }
  if (appearance === "premium") {
    return "bg-stone-50 text-stone-900 shadow-2xl shadow-stone-900/10 ring-1 ring-stone-200";
  }
  if (appearance === "beach") {
    return "bg-amber-50/98 text-amber-950 shadow-2xl shadow-amber-900/10 ring-1 ring-amber-200/80";
  }
  return "bg-white text-gray-900 shadow-2xl shadow-gray-900/10 ring-1 ring-gray-100";
}

function lightboxImageAreaClasses(appearance: ThemeId): string {
  if (appearance === "dark") {
    return "bg-zinc-950";
  }
  if (appearance === "premium") {
    return "bg-stone-200/70";
  }
  if (appearance === "beach") {
    return "bg-amber-200/45";
  }
  return "bg-gray-100";
}

export function lightboxCloseButtonClasses(appearance: ThemeId): string {
  if (appearance === "dark") {
    return "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 border-zinc-700";
  }
  if (appearance === "premium") {
    return "bg-stone-100 text-stone-800 hover:bg-stone-200 border-stone-200";
  }
  if (appearance === "beach") {
    return "bg-amber-100/90 text-amber-950 hover:bg-amber-200 border-amber-200/80";
  }
  return "bg-white text-gray-800 hover:bg-gray-50 border-gray-200";
}

type ProductDetailCardProps = {
  product: PublicProduct;
  theme: ResolvedMenuPresentation;
  getText: (item: Record<string, unknown>, field: string) => string;
  language?: string;
  /** Verilirse sağ üstte kapat (X) düğmesi çıkar (modal). */
  onClose?: () => void;
  /** Kategori adı (ürün sayfasında başlığın üstünde küçük etiket). */
  categoryLabel?: string;
  /** Ürünün paylaşılabilir adresi; verilirse "Linki kopyala" düğmesi çıkar. */
  shareUrl?: string;
};

function CopyLinkButton({
  url,
  language,
  appearance,
}: {
  url: string;
  language: string;
  appearance: ThemeId;
}) {
  const [copied, setCopied] = useState(false);
  const label = copied
    ? pickLang(language, { tr: "Link kopyalandı", en: "Link copied", ru: "Ссылка скопирована" })
    : pickLang(language, { tr: "Linki kopyala", en: "Copy link", ru: "Копировать ссылку" });

  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Panoya yazılamadıysa (eski tarayıcı / izin yok) paylaşım menüsünü dene.
      try {
        await navigator.share?.({ url });
      } catch {
        /* kullanıcı vazgeçti */
      }
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 self-start rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${lightboxCloseButtonClasses(appearance)}`}
    >
      {copied ? <Check size={14} aria-hidden /> : <Link2 size={14} aria-hidden />}
      {label}
    </button>
  );
}

/** Ürün detayının gövdesi: hem menüdeki açılır pencerede hem /p/{ürün} sayfasında kullanılır. */
export function ProductDetailCard({
  product,
  theme,
  getText,
  language = "tr",
  onClose,
  categoryLabel,
  shareUrl,
}: ProductDetailCardProps) {
  const resolvedTheme = theme ?? resolveMenuPresentation("classic", "classic");
  const c = resolvedTheme.classes;
  const appearance = resolvedTheme.appearance;

  const imageUrl = product.image_url?.trim();
  const productRecord = product as unknown as Record<string, unknown>;
  const name = getText(productRecord, "name");
  const description = getText(productRecord, "description");
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const showVariants = hasProductVariants(variants);
  const optionalMeta = readOptionalMeta(productRecord);
  const nutrition = readNutrition(productRecord);
  const badges = resolveProductBadges(product.badges, language);
  const soldOut = product.is_sold_out === true;
  const hasImage = Boolean(imageUrl);

  return (
    <div
      className={`relative flex w-full max-w-[420px] flex-col rounded-3xl ${lightboxCardClasses(appearance)}`}
      onClick={(event) => event.stopPropagation()}
    >
      {onClose ? (
        <div className="flex shrink-0 justify-end px-4 pt-4 sm:px-5 sm:pt-5">
          <button
            type="button"
            onClick={onClose}
            className={`flex h-11 w-11 items-center justify-center rounded-full border shadow-md transition-colors ${lightboxCloseButtonClasses(appearance)}`}
            aria-label={pickLang(language, { tr: "Kapat", en: "Close", ru: "Закрыть" })}
          >
            <X size={22} aria-hidden />
          </button>
        </div>
      ) : (
        <div className="h-4 shrink-0 sm:h-5" aria-hidden />
      )}

      {hasImage && (
        <div className="px-4 sm:px-5">
          <div
            className={`relative aspect-square w-full overflow-hidden rounded-2xl sm:rounded-3xl ${lightboxImageAreaClasses(appearance)}`}
          >
            <img
              src={imageUrl}
              alt={name || "Ürün görseli"}
              className="absolute inset-0 h-full w-full object-cover"
              draggable={false}
            />
          </div>
        </div>
      )}

      <div
        className={`flex flex-col gap-4 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:gap-5 sm:px-5 sm:pb-[max(1.5rem,env(safe-area-inset-bottom))] ${
          hasImage ? "pt-6 sm:pt-7" : "pt-2 sm:pt-3"
        }`}
      >
        {categoryLabel ? (
          <p className={`${c.allergenLabel} -mb-2 normal-case tracking-wide`}>{categoryLabel}</p>
        ) : null}
        <div className="flex items-start justify-between gap-4">
          <h2 className={`${c.fontHeading} ${c.productTitle} min-w-0 text-lg leading-snug sm:text-xl`}>
            {name}
          </h2>
          {!showVariants && (
            <div className="shrink-0 pt-0.5">
              <PublicMenuPrice raw={product.price} theme={resolvedTheme} size="product" />
            </div>
          )}
        </div>

        {showVariants && (
          <ul className={c.variantList} aria-label="Fiyat seçenekleri">
            {variants.map((variant) => {
              const label = getVariantLabel(variant, language);
              const hasPrice = parsePriceForDisplay(variant.price) != null;
              return (
                <li key={variant.id} className={c.variantItem}>
                  <span className={c.variantLabel}>{label}</span>
                  {hasPrice ? (
                    <PublicMenuPrice raw={variant.price} theme={resolvedTheme} size="variant" />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {description ? (
          <p className={`${c.productDescription} leading-relaxed`}>{description}</p>
        ) : null}

        {(soldOut || badges.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {soldOut && (
              <span className="rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-white">
                {pickLang(language, { tr: "Tükendi", en: "Sold out", ru: "Нет в наличии" })}
              </span>
            )}
            {badges.map((badge) => (
              <span
                key={badge.id}
                className="rounded-full border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-bold text-gray-800"
              >
                <span aria-hidden>{badge.icon}</span> {badge.label}
              </span>
            ))}
          </div>
        )}

        {hasNutrition(nutrition) && (
          <dl className="flex flex-wrap gap-x-5 gap-y-3">
            {[
              { label: pickLang(language, { tr: "Kalori", en: "Calories", ru: "Калории" }), value: nutrition.calories, unit: "kcal" },
              { label: pickLang(language, { tr: "Protein", en: "Protein", ru: "Белки" }), value: nutrition.protein_g, unit: "g" },
              { label: pickLang(language, { tr: "Karbonhidrat", en: "Carbs", ru: "Углеводы" }), value: nutrition.carbs_g, unit: "g" },
              { label: pickLang(language, { tr: "Yağ", en: "Fat", ru: "Жиры" }), value: nutrition.fat_g, unit: "g" },
            ]
              .filter((item) => item.value !== null)
              .map((item) => (
                <div key={item.label} className="min-w-[5rem]">
                  <dt className={`${c.allergenLabel} normal-case tracking-wide`}>{item.label}</dt>
                  <dd className={`${c.fontBody} mt-0.5 text-sm font-semibold`}>
                    {item.value} {item.unit}
                  </dd>
                </div>
              ))}
          </dl>
        )}

        {optionalMeta.length > 0 && (
          <dl className="flex flex-wrap gap-x-5 gap-y-3">
            {optionalMeta.map((item) => (
              <div key={item.label} className="min-w-[5rem]">
                <dt className={`${c.allergenLabel} normal-case tracking-wide`}>{item.label}</dt>
                <dd className={`${c.fontBody} mt-0.5 text-sm font-semibold`}>{item.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <PublicProductAllergens
          allergens={product.allergens}
          language={language}
          theme={resolvedTheme}
          className="flex flex-wrap gap-2"
        />

        {shareUrl ? <CopyLinkButton url={shareUrl} language={language} appearance={appearance} /> : null}
      </div>
    </div>
  );
}

export function ProductImageLightbox({
  open,
  onClose,
  product,
  theme,
  getText,
  language = "tr",
  shareUrl,
}: ProductImageLightboxProps) {
  const productRecord = product as unknown as Record<string, unknown>;
  const name = getText(productRecord, "name");

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={name ? `${name} — ürün detayı` : "Ürün detayı"}
      onClick={onClose}
    >
      <div className="flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-[420px] overflow-y-auto rounded-3xl">
        <ProductDetailCard
          product={product}
          theme={theme}
          getText={getText}
          language={language}
          onClose={onClose}
          shareUrl={shareUrl}
        />
      </div>
    </div>,
    document.body
  );
}
