"use client";

import { resolveProductAllergens } from "@/lib/public-menu/allergens";
import type { ResolvedMenuPresentation } from "@/lib/public-menu/themes/resolve";

type PublicProductAllergensProps = {
  allergens: string[] | null | undefined;
  language: string;
  theme: ResolvedMenuPresentation;
  className?: string;
};

export function PublicProductAllergens({
  allergens,
  language,
  theme,
  className = "flex flex-wrap gap-1 mt-auto",
}: PublicProductAllergensProps) {
  const c = theme.classes;
  const items = resolveProductAllergens(allergens, language);

  if (items.length === 0) return null;

  return (
    <div className={className}>
      {items.map((allergen) => (
        <div key={allergen.id} className={c.allergenBadge}>
          <span className="text-[10px]" aria-hidden>
            {allergen.icon}
          </span>
          <span className={c.allergenLabel}>{allergen.label}</span>
        </div>
      ))}
    </div>
  );
}
