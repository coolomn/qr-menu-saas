import type { Metadata } from "next";
import { canonicalMenuUrl } from "@/lib/domains/hosts";
import { loadMenuSlugName } from "@/lib/public-menu/menu-layout-context";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const name = await loadMenuSlugName(slug);
  const title = name ? `${name} - Dijital menü` : "Menü - TapMenu";
  return {
    title,
    // Menü hem eski (tapmenu.com.tr/menu/…) hem yeni (qr.tapmenu.com.tr/…) adreste açılır;
    // arama motorlarına asıl adresin qr alan adı olduğunu bildiririz.
    ...(name ? { alternates: { canonical: canonicalMenuUrl(slug) } } : {}),
  };
}

export default function MenuSlugLayout({ children }: { children: React.ReactNode }) {
  return children;
}
