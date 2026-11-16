"use client";

import { useState } from "react";
import { Loader2, Palette } from "lucide-react";
import { contrastRatio, DARK_THEME_BG, MIN_TEXT_CONTRAST, parseHex } from "@/lib/brand-color/color-utils";
import { suggestFromPixels, type BrandColorSuggestion } from "@/lib/brand-color/suggest";
import { loadLogoPixels } from "@/lib/brand-color/load-logo-pixels";

type Suggestion = BrandColorSuggestion;

function darkRatio(hex: string): number {
  const rgb = parseHex(hex);
  return rgb ? contrastRatio(rgb, DARK_THEME_BG) : 21;
}

type Props = {
  /** Henüz kaydedilmemiş, yeni seçilen logo dosyası (varsa o analiz edilir). */
  logoFile: File | null;
  /** Kayıtlı logo adresi. */
  logoUrl: string;
  /** Seçili görünüm (tema). "dark" ise koyu zemin kontrastı da uyarılır. */
  themeId: string;
  /** Şu anki marka rengi (seçili olanı işaretlemek için). */
  currentColor: string;
  /** Öneri seçilince form alanına yazılır; kaydetmek kullanıcıya kalır. */
  onPick: (hex: string) => void;
};

/**
 * Faz 2.11d: logodan marka rengi önerisi. Hiçbir şeyi kendiliğinden değiştirmez.
 * Logo değişince öneriler sıfırlansın diye çağıran `key` verir (logo dosyası + adres).
 */
export function LogoColorSuggest({ logoFile, logoUrl, themeId, currentColor, onPick }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const hasLogo = !!logoFile || !!logoUrl.trim();

  const analyze = async () => {
    setBusy(true);
    setError(null);
    setPicked(null);
    try {
      const pixels = await loadLogoPixels(logoFile ?? logoUrl);
      const unique = suggestFromPixels(pixels, 4);
      setSuggestions(unique);
      if (unique.length === 0) setError("Logoda belirgin bir renk bulunamadı. Rengi elle seçebilirsiniz.");
    } catch {
      setSuggestions(null);
      setError("Logo okunamadı. Farklı bir logo dosyası seçip tekrar deneyin ya da rengi elle seçin.");
    } finally {
      setBusy(false);
    }
  };

  if (!hasLogo) {
    return (
      <p className="text-[10px] md:text-xs font-bold text-gray-500">
        Logo yükledikten sonra buradan logonuzdan renk önerisi alabilirsiniz.
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-3xl border-2 border-violet-100 bg-violet-50/40 p-4 md:p-5">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Palette size={18} className="text-violet-600" aria-hidden />
          <h3 className="text-xs md:text-sm font-black uppercase text-violet-900">Logodan renk önerisi</h3>
        </div>
        <p className="text-[10px] md:text-xs font-bold text-gray-500 leading-snug">
          Logonuzdaki baskın renklerden marka rengi önerir. Beyaz zeminde okunaklı olması için gerekirse rengi biraz
          koyulaştırır. Siz seçmeden hiçbir şey değişmez. Not: &quot;Koyu&quot; görünümde kategori başlıkları marka renginde, koyu zemin üstüne yazılır.
        </p>
      </div>

      <button
        type="button"
        onClick={() => void analyze()}
        disabled={busy}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 text-xs font-black text-white hover:bg-violet-700 disabled:opacity-60"
      >
        {busy && <Loader2 size={14} className="animate-spin" aria-hidden />}
        {suggestions ? "Yeniden öner" : "Logomdan renk öner"}
      </button>

      {/* Canlı bölge yalnız kısa mesajlar için (DOM'da hep durur); öneri listesi dışarıda. */}
      <p role="status" aria-live="polite" className={`min-h-4 text-xs font-bold ${error ? "text-red-600" : picked ? "text-green-700" : "text-gray-500"}`}>
        {busy
          ? "Logo analiz ediliyor…"
          : error
            ? error
            : picked
              ? `${picked.toUpperCase()} marka rengi olarak seçildi. Kalıcı olması için sayfadaki Kaydet düğmesine basın.`
              : ""}
      </p>

      <div className="space-y-3">
        {suggestions && suggestions.length > 0 && (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {suggestions.map((s) => {
              const selected = s.hex.toLowerCase() === currentColor.trim().toLowerCase();
              return (
                <li key={s.hex} className="flex flex-col gap-2 rounded-2xl border border-gray-100 bg-white p-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="h-10 w-10 shrink-0 rounded-xl border border-black/10"
                      style={{ backgroundColor: s.hex }}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-black text-gray-900">{s.hex.toUpperCase()}</p>
                      <p className="text-[10px] font-bold text-gray-500">
                        {s.adjusted
                          ? `Logodaki ${s.original.toUpperCase()} rengi okunaklılık için koyulaştırıldı`
                          : "Logodaki renk, okunaklı"}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-black" style={{ color: s.hex }}>
                    Örnek fiyat: 120 ₺
                  </p>
                  <p className="text-[10px] font-bold text-gray-500">
                    Beyaz zeminde kontrast {s.ratio.toFixed(1)}:1 (en az {MIN_TEXT_CONTRAST}:1 önerilir)
                  </p>
                  {themeId === "dark" && darkRatio(s.hex) < MIN_TEXT_CONTRAST && (
                    <p className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-800">
                      Seçili &quot;Koyu&quot; görünümde bu renk koyu zeminde silik kalır (kontrast {darkRatio(s.hex).toFixed(1)}:1).
                      Daha açık bir ton ya da açık bir görünüm daha okunaklı olur.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (selected) return;
                      onPick(s.hex);
                      setPicked(s.hex);
                    }}
                    aria-disabled={selected}
                    aria-label={`${s.hex.toUpperCase()} rengini marka rengi yap`}
                    className={`min-h-11 rounded-xl px-4 text-xs font-black ${selected ? "bg-gray-200 text-gray-500" : "bg-gray-900 text-white hover:bg-gray-700"}`}
                  >
                    {selected ? "Şu an seçili" : "Marka rengi yap"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

      </div>
    </div>
  );
}
