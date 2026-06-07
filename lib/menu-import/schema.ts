import { z } from "zod";

const optionalNullableText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.literal("")])
    .optional()
    .nullable()
    .transform((v) => (v == null || v === "" ? null : v));

export const importVariantSchema = z.object({
  label: z.string().trim().min(1).max(80),
  label_en: optionalNullableText(80),
  label_ru: optionalNullableText(80),
  price: optionalNullableText(64),
});

/** AI ve commit için ortak yapı */
export const importProductSchema = z
  .object({
    name: z.string().trim().min(1).max(240),
    name_en: optionalNullableText(240),
    name_ru: optionalNullableText(240),
    description: optionalNullableText(4000),
    description_en: optionalNullableText(4000),
    description_ru: optionalNullableText(4000),
    price: optionalNullableText(64),
    variants: z.array(importVariantSchema).max(20).optional(),
  })
  .transform((product) => ({
    ...product,
    variants: product.variants?.length ? product.variants : undefined,
  }));

export const importCategorySchema = z.object({
  name: z.string().trim().min(1).max(200),
  name_en: optionalNullableText(200),
  name_ru: optionalNullableText(200),
  main_group: z
    .union([z.string().trim().max(120), z.literal("")])
    .optional()
    .nullable()
    .transform((v) => (v == null || v === "" ? null : v)),
  products: z.array(importProductSchema).max(200),
});

export const importMenuPayloadSchema = z.object({
  categories: z.array(importCategorySchema).min(1).max(80),
});

export type ImportMenuPayload = z.infer<typeof importMenuPayloadSchema>;
export type ImportCategory = z.infer<typeof importCategorySchema>;
export type ImportVariant = z.infer<typeof importVariantSchema>;
export type ImportProduct = z.infer<typeof importProductSchema>;

export const importCategoryTargetSchema = z.object({
  import_index: z.number().int().min(0).max(79),
  mode: z.enum(["create", "existing"]),
  existing_category_id: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1).max(200).optional(),
  main_group: z
    .union([z.string().trim().max(120), z.literal("")])
    .optional()
    .nullable(),
});

export const importCommitRequestSchema = z.object({
  restaurantId: z.string().uuid(),
  target_menu_collection_id: z.string().uuid().optional(),
  payload: importMenuPayloadSchema,
  category_targets: z.array(importCategoryTargetSchema).optional(),
});

export type ImportCategoryTarget = z.infer<typeof importCategoryTargetSchema>;
export type ImportCommitRequest = z.infer<typeof importCommitRequestSchema>;

const MAX_TOTAL_PRODUCTS = 400;

export const MENU_IMPORT_EMPTY_RESULT_MESSAGE =
  "Menüden ürün veya kategori tespit edilemedi. Daha net bir PDF veya menü görseli yükleyin.";

/** Boş kategorileri atar, ürün üst sınırını uygular. */
export function enforceProductLimit(payload: ImportMenuPayload): ImportMenuPayload {
  let count = 0;
  const out: ImportCategory[] = [];
  outer: for (const cat of payload.categories) {
    const nextProducts: ImportProduct[] = [];
    for (const p of cat.products) {
      if (count >= MAX_TOTAL_PRODUCTS) {
        if (nextProducts.length > 0 && cat.name.trim()) {
          out.push({ ...cat, products: nextProducts });
        }
        break outer;
      }
      nextProducts.push(p);
      count++;
    }
    if (nextProducts.length > 0 && cat.name.trim()) {
      out.push({ ...cat, products: nextProducts });
    }
  }
  if (out.length === 0) {
    throw new Error(MENU_IMPORT_EMPTY_RESULT_MESSAGE);
  }
  return { categories: out };
}
