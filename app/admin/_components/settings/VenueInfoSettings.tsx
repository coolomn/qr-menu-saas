"use client";

import type { RestaurantSettingsFormState } from "@/lib/admin-menu/save-restaurant-settings";
import {
  SOCIAL_PLATFORMS,
  WEEK_DAYS,
  WEEK_DAY_LABELS,
  defaultOpeningHours,
  type WeekDay,
} from "@/lib/public-menu/venue-info";

type Props = {
  value: RestaurantSettingsFormState;
  onChange: (patch: Partial<RestaurantSettingsFormState>) => void;
};

const inputClass =
  "w-full border-2 border-gray-100 bg-white p-3 rounded-2xl font-bold text-gray-900 outline-none text-sm focus:border-blue-300";
const labelClass = "block text-[10px] md:text-xs font-black text-gray-400 mb-1.5 uppercase tracking-widest";

export function VenueInfoSettings({ value, onChange }: Props) {
  const hours = value.opening_hours;

  const updateDay = (day: WeekDay, patch: Partial<{ closed: boolean; open: string; close: string }>) => {
    if (!hours) return;
    onChange({ opening_hours: { ...hours, [day]: { ...hours[day], ...patch } } });
  };

  return (
    <div className="space-y-4">
      <div className="p-4 md:p-6 border-2 border-gray-100 rounded-3xl bg-gray-50/50 space-y-4">
        <div>
          <h3 className="text-xs md:text-sm font-black text-gray-900 uppercase">Mekan Bilgileri</h3>
          <p className="text-[10px] md:text-xs font-bold text-gray-500 mt-1">
            Menüde “Mekan bilgileri” düğmesi ve WhatsApp butonu olarak görünür. Boş bıraktığınız alan menüde gösterilmez.
          </p>
        </div>

        <div>
          <label className={labelClass}>WhatsApp numarası</label>
          <input
            type="tel"
            inputMode="tel"
            placeholder="0555 123 45 67"
            className={inputClass}
            value={value.whatsapp_number}
            onChange={(e) => onChange({ whatsapp_number: e.target.value })}
          />
          <p className="mt-1 text-[10px] font-bold text-gray-400">Müşteri butona basınca bu numaraya WhatsApp mesajı açılır.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Wi-Fi adı</label>
            <input
              type="text"
              maxLength={64}
              className={inputClass}
              value={value.wifi_name}
              onChange={(e) => onChange({ wifi_name: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass}>Wi-Fi şifresi</label>
            <input
              type="text"
              maxLength={64}
              className={inputClass}
              value={value.wifi_password}
              onChange={(e) => onChange({ wifi_password: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Google yorum linki</label>
          <input
            type="url"
            placeholder="https://g.page/r/…/review"
            className={inputClass}
            value={value.google_review_url}
            onChange={(e) => onChange({ google_review_url: e.target.value })}
          />
          <p className="mt-1 text-[10px] font-bold text-gray-400">
            Google Business Profile → “Yorum isteyin” bağlantısını yapıştırın; menüde “Google’da değerlendirin” düğmesi çıkar.
          </p>
        </div>

        <label className="flex items-start gap-3 rounded-2xl bg-white border-2 border-gray-100 p-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 rounded border-gray-300"
            checked={value.show_price_date}
            onChange={(e) => onChange({ show_price_date: e.target.checked })}
          />
          <span className="text-xs font-bold text-gray-700">
            Menü altında “Fiyatlar en son … tarihinde güncellenmiştir” notunu göster
            <span className="block text-[10px] font-bold text-gray-400 mt-0.5">
              Tarih, bir ürünün fiyatı her değiştiğinde otomatik güncellenir.
            </span>
          </span>
        </label>
      </div>

      <div className="p-4 md:p-6 border-2 border-gray-100 rounded-3xl bg-gray-50/50 space-y-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-gray-300"
            checked={hours !== null}
            onChange={(e) => onChange({ opening_hours: e.target.checked ? defaultOpeningHours() : null })}
          />
          <span className="text-xs md:text-sm font-black text-gray-900 uppercase">Çalışma saatlerini menüde göster</span>
        </label>
        {hours ? (
          <ul className="space-y-2">
            {WEEK_DAYS.map((day) => (
              <li key={day} className="flex flex-wrap items-center gap-2 rounded-2xl bg-white border-2 border-gray-100 px-3 py-2">
                <span className="w-24 text-xs font-black text-gray-700">{WEEK_DAY_LABELS[day].tr}</span>
                <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300"
                    checked={hours[day].closed}
                    onChange={(e) => updateDay(day, { closed: e.target.checked })}
                  />
                  Kapalı
                </label>
                {!hours[day].closed && (
                  <span className="flex items-center gap-1.5">
                    <input
                      type="time"
                      className="rounded-lg border-2 border-gray-100 px-2 py-1 text-sm font-bold"
                      value={hours[day].open}
                      onChange={(e) => updateDay(day, { open: e.target.value })}
                    />
                    <span className="text-gray-400">–</span>
                    <input
                      type="time"
                      className="rounded-lg border-2 border-gray-100 px-2 py-1 text-sm font-bold"
                      value={hours[day].close}
                      onChange={(e) => updateDay(day, { close: e.target.value })}
                    />
                  </span>
                )}
              </li>
            ))}
            <li className="text-[10px] font-bold text-gray-400">
              Gece yarısını aşan saatler desteklenir (ör. 22:00 – 02:00). Saat dilimi: Türkiye.
            </li>
          </ul>
        ) : null}
      </div>

      <div className="p-4 md:p-6 border-2 border-gray-100 rounded-3xl bg-gray-50/50 space-y-3">
        <div>
          <h3 className="text-xs md:text-sm font-black text-gray-900 uppercase">Diğer Sosyal Hesaplar</h3>
          <p className="text-[10px] md:text-xs font-bold text-gray-500 mt-1">
            Kullanıcı adı (@mekan) veya tam bağlantı. Instagram yukarıdaki ayrı alandan yönetilir.
          </p>
        </div>
        {SOCIAL_PLATFORMS.map((platform) => (
          <div key={platform.id}>
            <label className={labelClass}>{platform.label}</label>
            <input
              type="text"
              placeholder={platform.placeholder}
              maxLength={300}
              className={inputClass}
              value={value.social_links[platform.id] ?? ""}
              onChange={(e) =>
                onChange({ social_links: { ...value.social_links, [platform.id]: e.target.value } })
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}
