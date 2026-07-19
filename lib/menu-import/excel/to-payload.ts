import type { ImportCategory, ImportMenuPayload, ImportProduct, ImportVariant } from "../schema";
import { EXCEL_EMPTY_MESSAGE } from "./constants";
import type { ExcelExtractionResult, ExcelProductCandidate } from "./types";

/**
 * Excel adaylarını mevcut ImportMenuPayload’a dönüştürür.
 * Varyantlar: aynı (category+name) altında ImportProduct.variants[] olarak birleştirilir.
 * Yeni DB tablosu / migration YOK — mevcut product_variants commit yolu kullanılır.
 */
export function candidatesToImportPayload(
  candidates: ExcelProductCandidate[]
): ImportMenuPayload {
  if (candidates.length === 0) {
    throw new Error(EXCEL_EMPTY_MESSAGE);
  }

  type AccProduct = {
    product: ImportProduct;
    variantRows: { label: string; price: string | null }[];
    reviewRequired: boolean;
  };

  const categories = new Map<string, Map<string, AccProduct>>();

  for (const c of candidates) {
    const catName = (c.category || "Diğer").trim() || "Diğer";
    const productName = c.name.trim();
    if (!productName) continue;

    if (!categories.has(catName)) categories.set(catName, new Map());
    const products = categories.get(catName)!;

    let acc = products.get(productName);
    if (!acc) {
      acc = {
        product: {
          name: productName,
          name_en: null,
          name_ru: null,
          description: c.description,
          description_en: null,
          description_ru: null,
          price: null,
          variants: undefined,
        },
        variantRows: [],
        reviewRequired: c.reviewRequired,
      };
      products.set(productName, acc);
    } else {
      if (c.description && !acc.product.description) {
        acc.product.description = c.description;
      } else if (c.description && acc.product.description && !acc.product.description.includes(c.description)) {
        acc.product.description = `${acc.product.description} ${c.description}`;
      }
      acc.reviewRequired = acc.reviewRequired || c.reviewRequired;
    }

    if (c.variant) {
      acc.variantRows.push({ label: c.variant, price: c.price });
    } else if (c.price) {
      // Single price — only set if no variants yet
      if (acc.variantRows.length === 0 && !acc.product.price) {
        acc.product.price = c.price;
      } else if (acc.variantRows.length > 0) {
        // Price without variant label while variants exist → review
        acc.reviewRequired = true;
      } else if (acc.product.price && acc.product.price !== c.price) {
        acc.reviewRequired = true;
      }
    }
  }

  const outCategories: ImportCategory[] = [];
  for (const [catName, products] of categories) {
    const productList: ImportProduct[] = [];
    for (const [, acc] of products) {
      if (acc.variantRows.length > 0) {
        const variants: ImportVariant[] = acc.variantRows.map((v) => ({
          label: v.label,
          label_en: null,
          label_ru: null,
          price: v.price,
        }));
        productList.push({
          ...acc.product,
          price: null,
          variants,
        });
      } else {
        productList.push(acc.product);
      }
    }
    if (productList.length > 0) {
      outCategories.push({
        name: catName,
        name_en: null,
        name_ru: null,
        main_group: null,
        products: productList,
      });
    }
  }

  if (outCategories.length === 0) {
    throw new Error(EXCEL_EMPTY_MESSAGE);
  }

  return { categories: outCategories };
}

export function summarizeExtraction(
  candidates: ExcelProductCandidate[],
  sheetCount: number
): ExcelExtractionResult {
  const categories = new Set(
    candidates.map((c) => (c.category || "Diğer").trim()).filter(Boolean)
  );
  const productKeys = new Set(
    candidates.map((c) => `${c.category || ""}::${c.name}`)
  );
  const variantCount = candidates.filter((c) => Boolean(c.variant)).length;
  const reviewRequiredCount = candidates.filter((c) => c.reviewRequired).length;

  return {
    candidates,
    sheetCount,
    categoryCount: categories.size,
    productCount: productKeys.size,
    variantCount,
    reviewRequiredCount,
  };
}
