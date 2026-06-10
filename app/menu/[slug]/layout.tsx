import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { MENU_FONT_VARIABLE_CLASSES } from "@/lib/public-menu/themes/fonts";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return { title: "Menü - TapMenu" };
  }
  const supabase = createClient(url, key);
  const { data } = await supabase
    .from("restaurants")
    .select("name")
    .eq("slug", slug)
    .maybeSingle();
  const name = typeof data?.name === "string" ? data.name.trim() : "";
  const title = name ? `${name} - Dijital menü` : "Menü - TapMenu";
  return { title };
}

export default function MenuSlugLayout({ children }: { children: React.ReactNode }) {
  return <div className={MENU_FONT_VARIABLE_CLASSES}>{children}</div>;
}
