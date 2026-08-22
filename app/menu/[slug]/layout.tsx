import type { Metadata } from "next";
import { loadMenuSlugName } from "@/lib/public-menu/menu-layout-context";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const name = await loadMenuSlugName(slug);
  const title = name ? `${name} - Dijital menü` : "Menü - TapMenu";
  return { title };
}

export default function MenuSlugLayout({ children }: { children: React.ReactNode }) {
  return children;
}
