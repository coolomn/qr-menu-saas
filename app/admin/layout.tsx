import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TapMenu - Panel",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
