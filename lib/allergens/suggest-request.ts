import { z } from "zod";

/**
 * Metin olmayan alanlar (null, sayı…) boş metin sayılır (eski davranış).
 * Uzun metin reddedilmez, kırpılır: meşru uzun açıklamalı ürün de öneri alabilsin,
 * ama OpenAI'ye giden girdi boyutu sınırlı kalsın.
 */
const textField = (max: number) =>
  z.preprocess((v) => (typeof v === "string" ? v.slice(0, max) : ""), z.string());

export const suggestAllergensBodySchema = z.object({
  restaurantId: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined),
    z.guid().optional()
  ),
  name: textField(300),
  description: textField(3000),
  categoryName: textField(300),
  name_en: textField(300),
  description_en: textField(3000),
  name_ru: textField(300),
  description_ru: textField(3000),
  menuCollectionName: textField(1000),
});
