import { MAX_PRODUCT_VARIANTS, minActiveVariantPrice } from "@/lib/admin-menu/product-variants";
import type { ImportProduct, ImportVariant } from "./schema";

export const MAX_IMPORT_VARIANTS = MAX_PRODUCT_VARIANTS;

export type ImportVariantCommitRow = {
  label: string;
  label_en: string | null;
  label_ru: string | null;
  price: string;
};

export type VariantTemplatePresetId = "raki" | "wine" | "size";

export const VARIANT_TEMPLATE_PRESETS: Record<
  VariantTemplatePresetId,
  { label: string; labels: string[] }
> = {
  raki: { label: "Rakı", labels: ["20 CL", "35 CL", "50 CL", "70 CL"] },
  wine: { label: "Şarap", labels: ["Kadeh", "Şişe"] },
  size: { label: "Boyut", labels: ["Küçük", "Orta", "Büyük"] },
};

export function hasImportProductVariants(product: ImportProduct): boolean {
  return normalizeImportVariantsForCommit(product.variants).length > 0;
}

/** Commit için geçerli varyant satırları (boş label atlanır). */
export function normalizeImportVariantsForCommit(
  variants: ImportVariant[] | undefined
): ImportVariantCommitRow[] {
  if (!variants?.length) return [];
  const out: ImportVariantCommitRow[] = [];
  for (const variant of variants) {
    const label = variant.label.trim();
    if (!label) continue;
    out.push({
      label,
      label_en: variant.label_en?.trim() || null,
      label_ru: variant.label_ru?.trim() || null,
      price: (variant.price ?? "").trim() || "",
    });
    if (out.length >= MAX_IMPORT_VARIANTS) break;
  }
  return out;
}

/** Varyantlı ürünlerde products.price senkronu; tek fiyatlıda mevcut alan. */
export function resolveImportProductPrice(product: ImportProduct): string {
  const variantRows = normalizeImportVariantsForCommit(product.variants);
  if (variantRows.length > 0) {
    return minActiveVariantPrice(
      variantRows.map((variant) => ({ price: variant.price, is_active: true }))
    );
  }
  return (product.price ?? "").trim() || "";
}

export function labelsToImportVariants(labels: string[]): ImportVariant[] {
  const seen = new Set<string>();
  const out: ImportVariant[] = [];
  for (const raw of labels) {
    const label = raw.trim();
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push({
      label,
      label_en: null,
      label_ru: null,
      price: null,
    });
    if (out.length >= MAX_IMPORT_VARIANTS) break;
  }
  return out;
}

export function parseCustomVariantLabels(input: string): string[] {
  return input.split(",").map((part) => part.trim()).filter(Boolean);
}

export function createEmptyImportVariant(): ImportVariant {
  return { label: "", label_en: null, label_ru: null, price: null };
}

export function countProductsWithVariants(products: ImportProduct[]): number {
  return products.filter(hasImportProductVariants).length;
}

export function applyVariantTemplateToProducts(
  products: ImportProduct[],
  labels: string[],
  overwrite: boolean
): { products: ImportProduct[]; applied: number; skipped: number } {
  const variants = labelsToImportVariants(labels);
  if (variants.length === 0) {
    return { products, applied: 0, skipped: products.length };
  }

  let applied = 0;
  let skipped = 0;
  const next = products.map((product) => {
    if (hasImportProductVariants(product) && !overwrite) {
      skipped++;
      return product;
    }
    applied++;
    return {
      ...product,
      price: null,
      variants: variants.map((variant) => ({ ...variant })),
    };
  });

  return { products: next, applied, skipped };
}
