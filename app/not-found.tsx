import type { Metadata } from "next";
import ErrorScreen from "@/app/_components/ErrorScreen";

export const metadata: Metadata = {
  title: "Sayfa bulunamadı - TapMenu",
};

export default function NotFound() {
  return (
    <ErrorScreen
      title="Sayfa bulunamadı"
      message="Aradığınız sayfa taşınmış ya da hiç var olmamış olabilir. Bir restoranın menüsünü arıyorsanız masadaki QR kodu tekrar okutun."
      actions={[{ kind: "link", label: "Ana sayfaya dön", href: "/" }]}
    />
  );
}
