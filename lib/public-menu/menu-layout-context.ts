import { cache } from "react";
import { createClient } from "@supabase/supabase-js";

/**
 * Metadata-only restaurant lookup (shared by menu slug layout metadata).
 */
export const loadMenuSlugName = cache(async (slug: string): Promise<string> => {
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) return "";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return "";

  const supabase = createClient(url, key);
  const { data } = await supabase
    .from("restaurants")
    .select("name")
    .eq("slug", normalizedSlug)
    .maybeSingle();

  return typeof data?.name === "string" ? data.name.trim() : "";
});
