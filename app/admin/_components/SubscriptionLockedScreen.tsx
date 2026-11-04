"use client";

import { Lock, LogOut, Store } from "lucide-react";
import { formatLockDate, type TenantLockState } from "@/lib/tenant/lock-state";
import { SUPPORT_CONTACT, buildSupportWhatsAppUrl } from "@/lib/tenant/support-contact";

type Props = {
  restaurantName: string;
  lock: Extract<TenantLockState, { locked: true }>;
  canSwitchRestaurant: boolean;
  onSwitchRestaurant: () => void;
  onLogout: () => void;
};

/**
 * Aboneliği bitmiş / askıya alınmış restoran sahibine panelin yerine gösterilir.
 * Hiçbir düzenleme ekranı açılmaz; QR menü de bu durumda kapalıdır.
 * Faz 2'de buraya "Aboneliği yenile" (iyzico) butonu gelecek.
 */
export default function SubscriptionLockedScreen({
  restaurantName,
  lock,
  canSwitchRestaurant,
  onSwitchRestaurant,
  onLogout,
}: Props) {
  const endDate = formatLockDate(lock.endsAt);
  const whatsappUrl = buildSupportWhatsAppUrl(restaurantName);
  const title = lock.reason === "suspended" ? "Hesabınız askıya alındı" : "Aboneliğiniz sona erdi";
  const body =
    lock.reason === "suspended"
      ? "Bu restoranın hesabı geçici olarak askıya alındı. Bu sürede menünüz müşterilerinize gösterilmiyor ve panelde değişiklik yapılamıyor."
      : `${endDate ? `Aboneliğiniz ${endDate} tarihinde sona erdi. ` : ""}Bu sürede menünüz müşterilerinize gösterilmiyor ve panelde değişiklik yapılamıyor. Menünüz ve tüm verileriniz saklanıyor; aboneliğinizi yenilediğinizde her şey kaldığı yerden devam eder.`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-lg border border-gray-100 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <Lock size={26} aria-hidden />
        </div>
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{restaurantName}</p>
        <h1 className="mt-1 text-xl font-bold text-gray-900">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">{body}</p>

        <div className="mt-6 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <p className="font-bold">Yenilemek için bizimle iletişime geçin</p>
          {whatsappUrl || SUPPORT_CONTACT.email ? (
            <div className="mt-2 flex flex-col gap-1.5">
              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-blue-700 underline underline-offset-2"
                >
                  WhatsApp ile yazın
                </a>
              )}
              {SUPPORT_CONTACT.email && (
                <a
                  href={`mailto:${SUPPORT_CONTACT.email}`}
                  className="font-bold text-blue-700 underline underline-offset-2"
                >
                  {SUPPORT_CONTACT.email}
                </a>
              )}
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col gap-2">
          {canSwitchRestaurant && (
            <button
              type="button"
              onClick={onSwitchRestaurant}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              <Store size={18} aria-hidden /> Başka restorana geç
            </button>
          )}
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-red-500 hover:bg-red-50"
          >
            <LogOut size={18} aria-hidden /> Çıkış yap
          </button>
        </div>
      </div>
    </div>
  );
}
