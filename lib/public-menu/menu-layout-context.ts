import { cache } from "react";
import { tryCreateServiceSupabase } from "@/lib/supabase/service";

/**
 * Metadata-only restaurant lookup (shared by menu slug layout metadata).
 *
 * Sunucu tarafı (service role) okuma: 2026-11-04 güvenlik düzeltmesinden beri anonim anahtar
 * restaurants tablosunu okuyamıyor; anon ile okununca başlık hep boş kalıyordu.
 * Yalnızca sunucu bileşenlerinden (app/menu/[slug]/layout.tsx) çağrılır; yalnızca `name` seçilir.
 */
export const loadMenuSlugName = cache(async (slug: string): Promise<string> => {
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) return "";

  const service = tryCreateServiceSupabase();
  if (!service.ok) return "";

  const { data } = await service.client
    .from("restaurants")
    .select("name")
    .eq("slug", normalizedSlug)
    .maybeSingle();

  return typeof data?.name === "string" ? data.name.trim() : "";
});
