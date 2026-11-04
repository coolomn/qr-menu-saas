import { z } from "zod";

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.literal(""), z.null()])
    .optional()
    .transform((v) => {
      if (v == null || v === "") return null;
      return v;
    });

const optionalTime = z
  .union([z.string().trim().max(16), z.literal(""), z.null()])
  .optional()
  .transform((v) => {
    if (v == null || v === "") return null;
    return v;
  });

/**
 * Menü kartı görseli yalnızca bizim Supabase Storage'ımızdan (https, public object yolu) gelebilir.
 * Başka sitelerden resim/izleme pikseli gösterilmesini ve http içeriği engeller.
 */
export function isAllowedStorageImageUrl(
  value: string,
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL
): boolean {
  let url: URL;
  let base: URL;
  try {
    url = new URL(value);
    base = new URL(supabaseUrl ?? "");
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    url.host === base.host &&
    url.pathname.startsWith("/storage/v1/object/public/")
  );
}

const storageImageUrl = z
  .union([
    z
      .string()
      .trim()
      .max(2000)
      .refine((v) => isAllowedStorageImageUrl(v), "Görsel adresi geçersiz."),
    z.literal(""),
    z.null(),
  ])
  .optional()
  .transform((v) => {
    if (v == null || v === "") return null;
    return v;
  });

const cardVisualType = z.enum(["icon", "image", "none"]);

const menuCollectionFields = {
  name: z.string().trim().min(1, "Menü adı zorunlu.").max(120),
  name_en: optionalText(120),
  name_ru: optionalText(120),
  description: optionalText(500),
  start_time: optionalTime,
  end_time: optionalTime,
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().min(0).max(9999).optional(),
  card_visual_type: cardVisualType.optional().default("icon"),
  card_image_url: storageImageUrl,
};

export const createMenuCollectionSchema = z.object({
  restaurantId: z.string().uuid("Geçersiz restoran."),
  ...menuCollectionFields,
});

export const patchMenuCollectionSchema = z
  .object({
    name: z.string().trim().min(1, "Menü adı zorunlu.").max(120).optional(),
    name_en: optionalText(120),
    name_ru: optionalText(120),
    description: optionalText(500),
    start_time: optionalTime,
    end_time: optionalTime,
    is_active: z.boolean().optional(),
    sort_order: z.number().int().min(0).max(9999).optional(),
    card_visual_type: cardVisualType.optional(),
    card_image_url: storageImageUrl,
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Güncellenecek alan belirtilmedi.",
  });

export type CreateMenuCollectionInput = z.infer<typeof createMenuCollectionSchema>;
export type PatchMenuCollectionInput = z.infer<typeof patchMenuCollectionSchema>;

export const putCategoryMenuCollectionsSchema = z.object({
  menu_collection_ids: z
    .array(z.string().uuid("Geçersiz menü kimliği."))
    .min(1, "En az bir menü seçilmeli."),
});

export type PutCategoryMenuCollectionsInput = z.infer<typeof putCategoryMenuCollectionsSchema>;

export const putProductMenuCollectionsSchema = putCategoryMenuCollectionsSchema;

export type PutProductMenuCollectionsInput = z.infer<typeof putProductMenuCollectionsSchema>;

export const bulkProductMenuCollectionsSchema = z.object({
  restaurantId: z.string().uuid("Geçersiz restoran."),
  productIds: z
    .array(z.string().uuid("Geçersiz ürün kimliği."))
    .min(1, "En az bir ürün seçilmeli.")
    .max(200, "En fazla 200 ürün seçilebilir."),
  menuCollectionIds: z
    .array(z.string().uuid("Geçersiz menü kimliği."))
    .min(1, "En az bir menü seçilmeli.")
    .max(50, "En fazla 50 menü seçilebilir."),
  action: z.enum(["add", "remove"]),
});

export type BulkProductMenuCollectionsInput = z.infer<typeof bulkProductMenuCollectionsSchema>;
