import { z } from "zod";
import { sanitizeScheduleForSave } from "@/lib/public-menu/schedule";
import { cleanTranslationsForSave } from "@/lib/i18n/edit-translations";
import { parseTranslations } from "@/lib/i18n/translations";
import { saveLimits } from "@/lib/i18n/translatable";

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
 * PATCH için: gövdede ALAN YOKSA undefined kalır (mevcut değere dokunulmaz); alan varsa
 * boş/null → null, dolu → değer. (optionalText/optionalTime yokluğu null'a çevirir; PATCH'te
 * bu, yalnızca {is_active} gönderildiğinde bile çeviri/açıklama/saat/görseli silerdi.)
 */
function keepAbsent<T extends z.ZodType>(schema: T) {
  return schema.optional().transform((v) => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    return v as Exclude<z.output<T>, undefined>;
  });
}

const patchText = (max: number) =>
  keepAbsent(z.union([z.string().trim().max(max), z.literal(""), z.null()]));

const patchTime = keepAbsent(z.union([z.string().trim().max(16), z.literal(""), z.null()]));

/** Zamanlama: geçersiz/boş → null ("her zaman"); PATCH'te alan yoksa dokunulmaz. */
const createScheduleField = z.unknown().optional().transform((v) => sanitizeScheduleForSave(v));
const patchScheduleField = z.unknown().optional().transform((v) => (v === undefined ? undefined : sanitizeScheduleForSave(v)));

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

const storageImageUrlInput = z.union([
  z
    .string()
    .trim()
    .max(2000)
    .refine((v) => isAllowedStorageImageUrl(v), "Görsel adresi geçersiz."),
  z.literal(""),
  z.null(),
]);

const storageImageUrl = storageImageUrlInput.optional().transform((v) => {
  if (v == null || v === "") return null;
  return v;
});

const cardVisualType = z.enum(["icon", "image", "none"]);

/**
 * Faz 2.5b: menü adı/açıklaması çevirileri. Biçim bozuksa 400 (sessizce {} yazıp tüm çevirileri
 * silmesin); bilinmeyen dil/alan atılır, sınırlar uygulanır. Alan yoksa dokunulmaz.
 */
const menuTranslationsField = z
  .record(z.string(), z.record(z.string(), z.string().max(2000)))
  .optional()
  .transform((v) => (v === undefined ? undefined : cleanTranslationsForSave(parseTranslations(v), saveLimits("menu"))));

const menuCollectionFields = {
  name: z.string().trim().min(1, "Menü adı zorunlu.").max(120),
  name_en: optionalText(120),
  name_ru: optionalText(120),
  translations: menuTranslationsField,
  description: optionalText(500),
  start_time: optionalTime,
  end_time: optionalTime,
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().min(0).max(9999).optional(),
  card_visual_type: cardVisualType.optional().default("icon"),
  card_image_url: storageImageUrl,
  schedule: createScheduleField,
};

export const createMenuCollectionSchema = z.object({
  restaurantId: z.string().uuid("Geçersiz restoran."),
  ...menuCollectionFields,
});

export const patchMenuCollectionSchema = z
  .object({
    name: z.string().trim().min(1, "Menü adı zorunlu.").max(120).optional(),
    name_en: patchText(120),
    name_ru: patchText(120),
    translations: menuTranslationsField,
    description: patchText(500),
    start_time: patchTime,
    end_time: patchTime,
    is_active: z.boolean().optional(),
    sort_order: z.number().int().min(0).max(9999).optional(),
    card_visual_type: cardVisualType.optional(),
    card_image_url: keepAbsent(storageImageUrlInput),
    schedule: patchScheduleField,
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
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
