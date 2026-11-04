/**
 * "Abonelik bitti" ekranında gösterilen destek iletişimi.
 * Boş bırakılan alan ekranda gösterilmez. (Geçici numara; ileride kurumsal numarayla değişecek.)
 */
export const SUPPORT_CONTACT: { whatsappNumber: string | null; email: string | null } = {
  whatsappNumber: "905555747292",
  email: null,
};

/** Restoran adını içeren hazır mesajla WhatsApp sohbet linki. */
export function buildSupportWhatsAppUrl(
  restaurantName: string,
  number: string | null = SUPPORT_CONTACT.whatsappNumber
): string | null {
  const digits = (number ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const name = restaurantName.trim();
  const text = name
    ? `Merhaba, ${name} için TapMenu aboneliğimi yenilemek istiyorum.`
    : "Merhaba, TapMenu aboneliğimi yenilemek istiyorum.";
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
