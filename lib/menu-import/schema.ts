import { z } from "zod";

/** AI ve commit için ortak yapı */
export const importProductSchema = z.object({
  name: z.string().trim().min(1).max(240),
  description: z
    .union([z.string().trim().max(4000), z.literal("")])
    .optional()
    .nullable()
    .transform((v) => (v == null || v === "" ? null : v)),
  price: z
    .union([z.string().trim().max(64), z.literal("")])
    .optional()
    .nullable()
    .transform((v) => (v == null || v === "" ? null : v)),
});

export const importCategorySchema = z.object({
  name: z.string().trim().min(1).max(200),
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
export type ImportProduct = z.infer<typeof importProductSchema>;

const MAX_TOTAL_PRODUCTS = 400;

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
    throw new Error("İçe aktarılacak geçerli ürün bulunamadı.");
  }
  return { categories: out };
}
