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

const menuCollectionFields = {
  name: z.string().trim().min(1, "Menü adı zorunlu.").max(120),
  name_en: optionalText(120),
  name_ru: optionalText(120),
  description: optionalText(500),
  start_time: optionalTime,
  end_time: optionalTime,
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().min(0).max(9999).optional(),
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
