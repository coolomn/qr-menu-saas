import { extractNumericPrice } from "@/lib/admin-menu/product-variants";
import type { ImportProduct } from "@/lib/menu-import/schema";
import {
  normalizeImportVariantsForCommit,
  resolveImportProductPrice,
} from "@/lib/menu-import/variant-templates";

/** Restoran kataloğundaki ürün — import eşleştirmesi için. */
export type ExistingCatalogProduct = {
  id: string;
  name: string;
  description: string | null;
  price: string | null;
  category_id: string;
  variant_labels: string[];
};

export type ProductMatchKind = "new" | "matched" | "conflict";

export type ProductConflictField = "price" | "description" | "variants";

export type ProductMergeAction = "keep_existing" | "update_from_import" | "create_separate";

export type ProductMatchResult = {
  kind: ProductMatchKind;
  existing: ExistingCatalogProduct | null;
  conflicts: ProductConflictField[];
};

export type ImportProductCommitPlan =
  | {
      mode: "create";
    }
  | {
      mode: "reuse";
      existing: ExistingCatalogProduct;
      updatePrice: string | null;
      fillDescription: string | null;
    };

/** Trim, Türkçe locale lowercase, ardışık boşlukları tek boşluğa indir. */
export function normalizeProductName(name: string): string {
  return name.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
}

export function normalizeVariantLabel(label: string): string {
  return normalizeProductName(label);
}

function normalizeDescription(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

export function pricesEqual(
  existingPrice: string | null | undefined,
  importPrice: string | null | undefined
): boolean {
  const a = (existingPrice ?? "").trim();
  const b = (importPrice ?? "").trim();
  if (!a && !b) return true;
  const na = extractNumericPrice(a);
  const nb = extractNumericPrice(b);
  if (na != null && nb != null) return na === nb;
  return a === b;
}

/** Mevcut açıklama dolu ve import açıklaması farklıysa çakışma. */
export function descriptionsConflict(
  existingDescription: string | null | undefined,
  importDescription: string | null | undefined
): boolean {
  const existing = normalizeDescription(existingDescription);
  if (!existing) return false;
  const incoming = normalizeDescription(importDescription);
  if (!incoming) return false;
  return existing !== incoming;
}

export function variantLabelSetKey(labels: string[]): string {
  const keys = [
    ...new Set(labels.map(normalizeVariantLabel).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, "tr"));
  return keys.join("\0");
}

export function variantSetsEqual(existingLabels: string[], importLabels: string[]): boolean {
  return variantLabelSetKey(existingLabels) === variantLabelSetKey(importLabels);
}

export function buildProductCatalogIndex(
  products: ExistingCatalogProduct[]
): Map<string, ExistingCatalogProduct> {
  const index = new Map<string, ExistingCatalogProduct>();
  for (const product of products) {
    const key = normalizeProductName(product.name);
    if (!key || index.has(key)) continue;
    index.set(key, product);
  }
  return index;
}

export function findCatalogProductByName(
  name: string,
  index: Map<string, ExistingCatalogProduct>
): ExistingCatalogProduct | null {
  const key = normalizeProductName(name);
  if (!key) return null;
  return index.get(key) ?? null;
}

export function classifyImportProductMatch(
  product: ImportProduct,
  existing: ExistingCatalogProduct | null
): ProductMatchResult {
  if (!existing) {
    return { kind: "new", existing: null, conflicts: [] };
  }

  const conflicts: ProductConflictField[] = [];
  const importPrice = resolveImportProductPrice(product);
  if (!pricesEqual(existing.price, importPrice)) {
    conflicts.push("price");
  }
  if (descriptionsConflict(existing.description, product.description)) {
    conflicts.push("description");
  }
  const importLabels = normalizeImportVariantsForCommit(product.variants).map((v) => v.label);
  if (!variantSetsEqual(existing.variant_labels, importLabels)) {
    conflicts.push("variants");
  }

  if (conflicts.length > 0) {
    return { kind: "conflict", existing, conflicts };
  }
  return { kind: "matched", existing, conflicts: [] };
}

export function planImportProductCommit(
  product: ImportProduct,
  index: Map<string, ExistingCatalogProduct>,
  userAction?: ProductMergeAction | null
): ImportProductCommitPlan {
  const existing = findCatalogProductByName(product.name, index);
  const match = classifyImportProductMatch(product, existing);

  if (match.kind === "new" || !match.existing) {
    return { mode: "create" };
  }

  if (userAction === "create_separate") {
    return { mode: "create" };
  }

  const importPrice = resolveImportProductPrice(product);
  const updatePrice =
    userAction === "update_from_import" && match.conflicts.includes("price")
      ? importPrice
      : null;

  const existingDesc = (match.existing.description ?? "").trim();
  const importDesc = (product.description ?? "").trim();
  const fillDescription = !existingDesc && importDesc ? importDesc : null;

  return {
    mode: "reuse",
    existing: match.existing,
    updatePrice,
    fillDescription,
  };
}

export function catalogProductFromInsert(
  id: string,
  categoryId: string,
  product: ImportProduct
): ExistingCatalogProduct {
  return {
    id,
    name: product.name.trim(),
    description: product.description ?? "",
    price: resolveImportProductPrice(product),
    category_id: categoryId,
    variant_labels: normalizeImportVariantsForCommit(product.variants).map((v) => v.label),
  };
}
