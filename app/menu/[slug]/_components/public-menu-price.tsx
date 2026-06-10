"use client";

import { parsePriceForDisplay } from "@/lib/format-price";
import type { ResolvedMenuPresentation } from "@/lib/public-menu/themes/resolve";

type PublicMenuPriceProps = {
  raw: string | null | undefined;
  theme: ResolvedMenuPresentation;
  size?: "product" | "variant";
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
}: PublicMenuPriceProps) {
  const parsed = parsePriceForDisplay(raw);
  if (!parsed) return null;

  const className =
    size === "variant"
      ? theme.priceTypography.variant
      : theme.priceTypography.product;

  const usePremiumCurrency = theme.font === "premium";

  return (
    <span style={{ color: theme.priceColor }} className={className}>
      {parsed.amount}
      {usePremiumCurrency ? (
        <PremiumCurrencyMark symbol={parsed.currency} />
      ) : (
        parsed.currency
      )}
    </span>
  );
}
