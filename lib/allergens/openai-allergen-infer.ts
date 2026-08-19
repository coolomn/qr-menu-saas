import OpenAI from "openai";
import {
  parseAllergenAiResponse,
  type AllergenSuggestInput,
  type AllergenSuggestion,
} from "@/lib/suggest-allergens";

const ALLERGEN_AI_TIMEOUT_MS = 8000;
const ALLERGEN_AI_MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `You are assisting with allergen suggestions for a restaurant menu.
Use the product name, description and category context.
Do not assume an allergen is certain when the recipe is unknown.
Return only likely EU allergen ids.
Separate explicit evidence from inferred recipe-based guesses.
Respect negative phrases such as gluten-free, vegan, dairy-free, nut-free.
If confidence is low, return no suggestion.
Do not include vegan or spicy. Those are not EU allergens.
Return JSON only: {"suggestions":[{"id":"dairy","confidence":"inferred","reason":"..."}]}
Canonical ids: gluten, crustaceans, egg, fish, peanuts, soy, dairy, nuts, celery, mustard, sesame, sulphites, lupin, molluscs.`;

function getClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  return new OpenAI({ apiKey: key, timeout: ALLERGEN_AI_TIMEOUT_MS });
}

export async function inferAllergensWithOpenAI(
  input: AllergenSuggestInput
): Promise<AllergenSuggestion[]> {
  const client = getClient();
  if (!client) return [];

  const userPayload = {
    name_tr: input.name || "",
    description_tr: input.description || "",
    name_en: input.name_en || "",
    description_en: input.description_en || "",
    name_ru: input.name_ru || "",
    description_ru: input.description_ru || "",
    category_name: input.categoryName || "",
    menu_collection_name: input.menuCollectionName || "",
  };

  try {
    const completion = await client.chat.completions.create({
      model: ALLERGEN_AI_MODEL,
      temperature: 0,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return parseAllergenAiResponse(parsed);
  } catch (error) {
    console.warn("allergen AI inference skipped:", error);
    return [];
  }
}
