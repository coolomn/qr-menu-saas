"use client";

import { useMemo, useState } from "react";
import { Megaphone } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { TranslationLanguage } from "@/lib/i18n/languages";
import type { TranslationMap } from "@/lib/i18n/translations";
import { getTranslationField, setTranslationField, translationStatus } from "@/lib/i18n/edit-translations";
import { applyAiResults } from "@/lib/admin-menu/form-ai-translate";
import { useFormAiTranslate } from "@/app/admin/_components/i18n/useFormAiTranslate";
import { TranslationSection, translationInputClass } from "@/app/admin/_components/i18n/TranslationTabs";
import {
  ANNOUNCEMENT_MAX_LENGTH,
  announcementForSave,
  isAnnouncementLive,
  validateAnnouncement,
  type Announcement,
} from "@/lib/public-menu/announcement";
import { localNow } from "@/lib/public-menu/schedule";

const supabase = getBrowserSupabase();

type Props = {
  restaurantId: string;
  value: Announcement;
  /** Menüde açık çeviri dilleri (TR hariç). */
  translationLanguages: readonly TranslationLanguage[];
  onSaved: (raw: Record<string, unknown>) => void;
};

const dateInputClass =
  "min-h-11 w-full border-2 border-gray-100 bg-white rounded-xl px-3 py-2 font-bold text-sm text-gray-900 outline-none focus:border-blue-300";

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return y && m && d ? `${d}.${m}.${y}` : isoDate;
}

/** Faz 2.9: müşteri menüsünün üstünde çıkan tek duyuru şeridi. */
export function AnnouncementCard({ restaurantId, value, translationLanguages, onSaved }: Props) {
  const [draft, setDraft] = useState<Announcement>(value);
  const [savedDraft, setSavedDraft] = useState<Announcement>(value);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const ai = useFormAiTranslate(restaurantId);

  const patch = (next: Partial<Announcement>) => {
    setMessage(null);
    setDraft((prev) => ({ ...prev, ...next }));
  };

  const dirty = JSON.stringify(announcementForSave(draft)) !== JSON.stringify(announcementForSave(savedDraft));

  const status = useMemo(() => {
    if (!draft.text.trim()) return { tone: "gray", text: "Duyuru yok." };
    if (!draft.enabled) return { tone: "gray", text: "Kapalı: müşteri menüsünde görünmez." };
    const today = localNow(new Date()).date;
    if (draft.starts_on && today < draft.starts_on) {
      return { tone: "amber", text: `${formatDate(draft.starts_on)} tarihinde otomatik başlayacak.` };
    }
    if (draft.ends_on && today > draft.ends_on) {
      return { tone: "amber", text: `Süresi doldu (${formatDate(draft.ends_on)}): artık görünmüyor.` };
    }
    if (isAnnouncementLive(draft, new Date())) {
      return {
        tone: "green",
        text: draft.ends_on
          ? `Menüde görünüyor, ${formatDate(draft.ends_on)} sonuna kadar.`
          : "Menüde görünüyor.",
      };
    }
    return { tone: "gray", text: "Görünmüyor." };
  }, [draft]);

  const save = async () => {
    const error = validateAnnouncement(draft);
    if (error) {
      setMessage({ ok: false, text: error });
      return;
    }
    setBusy(true);
    setMessage(null);
    const payload = announcementForSave(draft);
    const { error: dbError } = await supabase
      .from("restaurants")
      .update({ announcement: payload })
      .eq("id", restaurantId);
    setBusy(false);
    if (dbError) {
      setMessage({ ok: false, text: `Kaydedilemedi: ${dbError.message || "bilinmeyen hata"}` });
      return;
    }
    setSavedDraft(draft);
    onSaved(payload);
    setMessage({
      ok: true,
      text: draft.enabled
        ? "Kaydedildi. Müşteri menüsünde birkaç dakika içinde görünür."
        : "Kaydedildi. Duyuru kapalı.",
    });
  };

  const source = { text: draft.text };
  const entity = { id: "announcement", kind: "announcement" as const, source, translations: draft.translations };

  return (
    <section className="p-4 md:p-6 border-2 border-gray-100 rounded-3xl bg-gray-50/50 space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Megaphone size={18} className="text-amber-500" aria-hidden />
          <h3 className="text-xs md:text-sm font-black text-gray-900 uppercase">Duyuru Şeridi</h3>
        </div>
        <p className="text-[10px] md:text-xs font-bold text-gray-500 leading-snug">
          Müşteri menüsünün en üstünde çıkan kısa bir mesaj (kampanya, etkinlik, bilgilendirme). Misafir şeridi
          kapatabilir. Tarih verirseniz süre dolunca kendiliğinden kalkar.
        </p>
      </div>

      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => patch({ enabled: e.target.checked })}
          className="h-5 w-5 rounded border-gray-300"
        />
        <span className="text-sm font-black text-gray-900">Duyuruyu menüde göster</span>
      </label>

      <div className="space-y-1.5">
        <label htmlFor="announcement-text" className="block text-[10px] font-black uppercase tracking-widest text-gray-500">
          Duyuru metni (Türkçe)
        </label>
        <textarea
          id="announcement-text"
          rows={2}
          maxLength={ANNOUNCEMENT_MAX_LENGTH}
          value={draft.text}
          onChange={(e) => patch({ text: e.target.value })}
          placeholder="Örn. Hafta sonu akşamları canlı müzik var!"
          className={`${translationInputClass} resize-y`}
        />
        <p className="text-right text-[10px] font-bold text-gray-400">
          {draft.text.length}/{ANNOUNCEMENT_MAX_LENGTH}
        </p>
      </div>

      <TranslationSection
        languages={translationLanguages}
        statusFor={(lang) => translationStatus(source, draft.translations, lang)}
        onAiFill={() =>
          void ai.run([entity], translationLanguages, (results) =>
            setDraft((prev) => ({
              ...prev,
              translations: applyAiResults(prev.translations, results, "announcement") as TranslationMap,
            }))
          )
        }
        aiBusy={ai.busy}
        aiMessage={ai.message}
        hint="Boş bırakılan dilde müşteri Türkçe metni görür. AI yalnız boş dilleri doldurur; yazdıklarınız değişmez."
      >
        {(lang) => (
          <textarea
            rows={2}
            maxLength={ANNOUNCEMENT_MAX_LENGTH}
            aria-label={`Duyuru metni (${lang})`}
            value={getTranslationField(draft.translations, lang, "text")}
            onChange={(e) => patch({ translations: setTranslationField(draft.translations, lang, "text", e.target.value) })}
            className={`${translationInputClass} resize-y`}
          />
        )}
      </TranslationSection>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="announcement-start" className="block text-[10px] font-black uppercase tracking-widest text-gray-500">
            Başlangıç (isteğe bağlı)
          </label>
          <input
            id="announcement-start"
            type="date"
            value={draft.starts_on ?? ""}
            onChange={(e) => patch({ starts_on: e.target.value || null })}
            className={dateInputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="announcement-end" className="block text-[10px] font-black uppercase tracking-widest text-gray-500">
            Bitiş (o gün dahil, isteğe bağlı)
          </label>
          <input
            id="announcement-end"
            type="date"
            value={draft.ends_on ?? ""}
            min={draft.starts_on ?? undefined}
            onChange={(e) => patch({ ends_on: e.target.value || null })}
            className={dateInputClass}
          />
        </div>
      </div>

      <p
        role="status"
        className={`text-xs font-black ${
          status.tone === "green" ? "text-emerald-700" : status.tone === "amber" ? "text-amber-700" : "text-gray-500"
        }`}
      >
        {status.text}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !dirty}
          className="min-h-11 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Kaydediliyor…" : "Duyuruyu kaydet"}
        </button>
        {message && (
          <p role="status" className={`text-xs font-bold ${message.ok ? "text-emerald-700" : "text-red-600"}`}>
            {message.text}
          </p>
        )}
      </div>
    </section>
  );
}
