"use client";

import { parsePriceForDisplay } from "@/lib/format-price";
import { useApproxText } from "@/app/menu/[slug]/_components/menu-currency";
import type { ResolvedMenuPresentation } from "@/lib/public-menu/themes/resolve";

type PublicMenuPriceProps = {
  raw: string | null | undefined;
  theme: ResolvedMenuPresentation;
  size?: "product" | "variant";
  /** Faz 2.5c: seçili dövizde "≈ €12" eklensin mi (fiyat aralığında kapatılır). */
  approx?: boolean;
};

function PremiumCurrencyMark({ symbol }: { symbol: string }) {
  return (
    <span
      className="inline-block text-[0.8em] leading-none relative top-[0.06em]"
      aria-hidden
    >
      {symbol}
    </span>
  );
}

export function PublicMenuPrice({
  raw,
  theme,
  size = "product",
  approx = true,
}: PublicMenuPriceProps) {
  const parsed = parsePriceForDisplay(raw);
  const approxText = useApproxText(approx ? raw : null);
  if (!parsed) return null;

  const className =
    size === "variant"
      ? theme.priceTypography.variant
      : theme.priceTypography.product;

  const usePremiumCurrency = theme.font === "premium";

  const price = (
    <span style={{ color: theme.priceColor }} className={className}>
      {parsed.amount}
      {usePremiumCurrency ? (
        <PremiumCurrencyMark symbol={parsed.currency} />
      ) : (
        parsed.currency
      )}
    </span>
  );
  if (!approxText) return price;

  const approxEl = (
    <span style={{ color: theme.priceColor }} className="whitespace-nowrap text-[11px] font-semibold opacity-75">
      {approxText}
    </span>
  );
  // Ürün fiyatı: yaklaşık tutar altında (başlık daralmasın); seçenek satırı: yanında.
  return size === "product" ? (
    <span className="inline-flex shrink-0 flex-col items-end leading-tight">
      {price}
      {approxEl}
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-baseline gap-1.5 whitespace-nowrap">
      {approxEl}
      {price}
    </span>
  );
}
