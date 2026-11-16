"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AlertTriangle, Download, Printer, QrCode } from "lucide-react";
import { downloadBlob, downloadSvg, fileSlug, loadLogoDataUrl, printHtml, svgToPngBlob } from "@/lib/qr/browser";
import {
  buildCardSvg,
  buildPrintSheetHtml,
  CARD_HEIGHT,
  CARD_WIDTH,
  SHEET_LAYOUTS,
  type SheetLayout,
} from "@/lib/qr/card";
import { expandLabelInput, labelKindWord, QR_LABEL_BATCH_MAX, type QrLabelKind } from "@/lib/qr/label";
import { buildQrTargetUrl, isProductionHost } from "@/lib/qr/target";
import {
  buildQrSvg,
  DEFAULT_QR_BACKGROUND,
  DEFAULT_QR_FOREGROUND,
  normalizeHexColor,
  qrColorWarning,
  type QrDotShape,
} from "@/lib/qr/svg";

type Props = {
  restaurantName: string;
  slug: string;
  logoUrl: string | null;
  brandColor: string;
};

type LabelMode = "none" | QrLabelKind;

const SHAPES: { id: QrDotShape; label: string }[] = [
  { id: "square", label: "Kare" },
  { id: "rounded", label: "Yuvarlak köşe" },
  { id: "dots", label: "Nokta" },
];

const LABEL_MODES: { id: LabelMode; label: string; hint: string }[] = [
  { id: "none", label: "Etiketsiz", hint: "Genel QR" },
  { id: "masa", label: "Masa", hint: "Restoran / kafe" },
  { id: "oda", label: "Oda", hint: "Otel oda servisi" },
];

const inputClass =
  "w-full rounded-xl border-2 border-gray-100 bg-white px-3 py-2.5 text-sm font-bold text-gray-900 outline-none focus:border-blue-500";
const labelClass = "block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1.5";

function ColorField({ label, value, onChange, allowTransparent }: { label: string; value: string; onChange: (v: string) => void; allowTransparent?: boolean }) {
  const isTransparent = value === "transparent";
  return (
    <div>
      <span className={labelClass}>{label}</span>
      <div className="flex items-center gap-2 rounded-xl border-2 border-gray-100 bg-white p-1.5">
        <input
          type="color"
          aria-label={label}
          value={isTransparent ? "#ffffff" : normalizeHexColor(value, "#000000")}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-0"
        />
        <input
          type="text"
          aria-label={`${label} (kod)`}
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          maxLength={11}
          className="min-w-0 flex-1 bg-transparent font-mono text-sm font-black text-gray-900 outline-none"
        />
        {allowTransparent && (
          <button
            type="button"
            aria-pressed={isTransparent}
            onClick={() => onChange(isTransparent ? "#ffffff" : "transparent")}
            className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-black ${isTransparent ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}
          >
            Şeffaf
          </button>
        )}
      </div>
    </div>
  );
}

export function QrStudio({ restaurantName, slug, logoUrl, brandColor }: Props) {
  // Sunucuda ("") ve tarayıcıda aynı ilk çıktı; adres bilgisi hidrasyondan sonra gelir.
  const locationKey = useSyncExternalStore(
    () => () => {},
    () => `${window.location.hostname}|${window.location.origin}`,
    () => ""
  );
  const origin = useMemo(() => {
    if (!locationKey) return null;
    const [host = "", orig = ""] = locationKey.split("|");
    return { host, origin: orig };
  }, [locationKey]);

  const [foreground, setForeground] = useState(DEFAULT_QR_FOREGROUND);
  const [background, setBackground] = useState(DEFAULT_QR_BACKGROUND);
  const [shape, setShape] = useState<QrDotShape>("rounded");
  const [useLogo, setUseLogo] = useState(true);
  // Hangi logo adresi için hazırlandığı birlikte tutulur: adres değişince eski sonuç "yükleniyor" sayılır.
  const [logoResult, setLogoResult] = useState<{ url: string; data: string | null } | null>(null);
  const logoDataUrl = logoResult && logoResult.url === logoUrl ? logoResult.data : null;
  const logoState: "none" | "loading" | "ok" | "failed" = !logoUrl
    ? "none"
    : logoResult?.url !== logoUrl
      ? "loading"
      : logoResult.data
        ? "ok"
        : "failed";

  const [labelMode, setLabelMode] = useState<LabelMode>("masa");
  const [labelInput, setLabelInput] = useState("1");
  const [headline, setHeadline] = useState("Menü için QR kodu okutun");
  const [accent, setAccent] = useState(normalizeHexColor(brandColor, "#2563eb"));
  const [showAddress, setShowAddress] = useState(true);
  const [layout, setLayout] = useState<SheetLayout>("a6-4");
  const [previewIndex, setPreviewIndex] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!logoUrl) return;
    let cancelled = false;
    void loadLogoDataUrl(logoUrl).then((data) => {
      if (!cancelled) setLogoResult({ url: logoUrl, data });
    });
    return () => {
      cancelled = true;
    };
  }, [logoUrl]);

  const hostInfo = origin ?? { host: "", origin: "" };
  const baseUrl = useMemo(
    () => (origin ? buildQrTargetUrl({ slug, host: origin.host, origin: origin.origin }) : ""),
    [origin, slug]
  );
  const isLiveHost = origin ? isProductionHost(origin.host) : true;

  const expanded = useMemo(() => {
    if (labelMode === "none") return { values: [""], error: null as string | null };
    const result = expandLabelInput(labelInput, QR_LABEL_BATCH_MAX);
    if (!result.error && result.values.length === 0) return { values: [], error: "En az bir numara girin (örn. 5 veya 1-20)." };
    return result;
  }, [labelMode, labelInput]);

  const items = useMemo(
    () =>
      expanded.values.map((value) => ({
        value,
        url: buildQrTargetUrl({
          slug,
          host: hostInfo.host,
          origin: hostInfo.origin,
          label: labelMode === "none" ? null : { kind: labelMode, value },
        }),
      })),
    [expanded.values, labelMode, slug, hostInfo.host, hostInfo.origin]
  );

  const safeIndex = Math.min(previewIndex, Math.max(0, items.length - 1));
  const current = items[safeIndex];
  const logoForQr = useLogo && logoState === "ok" ? logoDataUrl : null;
  const warning = qrColorWarning(normalizeHexColor(foreground, DEFAULT_QR_FOREGROUND), background === "transparent" ? "transparent" : normalizeHexColor(background, DEFAULT_QR_BACKGROUND));

  const qrOptions = useMemo(
    () => ({
      foreground: normalizeHexColor(foreground, DEFAULT_QR_FOREGROUND),
      background: background === "transparent" ? "transparent" : normalizeHexColor(background, DEFAULT_QR_BACKGROUND),
      shape,
      logoHref: logoForQr,
    }),
    [foreground, background, shape, logoForQr]
  );

  const displayUrl = showAddress && baseUrl ? baseUrl.replace(/^https?:\/\//, "") : null;

  const cardSvgFor = (url: string, value: string) =>
    buildCardSvg({
      url,
      qr: qrOptions,
      restaurantName,
      logoHref: logoForQr,
      headline,
      label: labelMode === "none" ? null : { word: labelKindWord(labelMode, "tr"), value },
      accent,
      cardBackground: "#ffffff",
      displayUrl,
    });

  const cardPreview = current && baseUrl ? cardSvgFor(current.url, current.value) : "";

  const baseName = `${fileSlug(slug)}${labelMode !== "none" && current?.value ? `-${labelMode}-${fileSlug(current.value)}` : ""}`;

  const run = async (key: string, task: () => Promise<void> | void) => {
    setBusy(key);
    setMessage(null);
    try {
      await task();
    } catch {
      setMessage({ ok: false, text: "İşlem yapılamadı. Sayfayı yenileyip tekrar deneyin." });
    } finally {
      setBusy(null);
    }
  };

  const downloadQrSvg = () =>
    run("qr-svg", () => {
      if (!current) return;
      downloadSvg(buildQrSvg({ ...qrOptions, text: current.url }).svg, `qr-${baseName}.svg`);
    });

  const downloadQrPng = () =>
    run("qr-png", async () => {
      if (!current) return;
      const { svg } = buildQrSvg({ ...qrOptions, text: current.url });
      downloadBlob(await svgToPngBlob(svg, 1600, 1600), `qr-${baseName}.png`);
    });

  const downloadCardSvg = () =>
    run("card-svg", () => {
      if (!current) return;
      downloadSvg(cardSvgFor(current.url, current.value), `kart-${baseName}.svg`);
    });

  const downloadCardPng = () =>
    run("card-png", async () => {
      if (!current) return;
      // A6, 300 dpi ≈ 1240×1748
      downloadBlob(await svgToPngBlob(cardSvgFor(current.url, current.value), 1240, Math.round((1240 * CARD_HEIGHT) / CARD_WIDTH)), `kart-${baseName}.png`);
    });

  const printSheet = () =>
    run("print", () => {
      if (items.length === 0) return;
      const cards = items.map((it) => cardSvgFor(it.url, it.value));
      printHtml(buildPrintSheetHtml({ cards, layout, title: `${restaurantName} — QR kartları` }));
      setMessage({ ok: true, text: "Yazdırma penceresi açıldı. PDF için hedef olarak “PDF olarak kaydet”i seçin." });
    });

  const canAct = Boolean(current) && !expanded.error && Boolean(baseUrl) && busy === null;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <section className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm md:p-6">
        <h2 className="flex items-center gap-2 text-xl font-black tracking-tight text-gray-900 md:text-2xl">
          <QrCode size={22} className="text-blue-600" /> QR Stüdyosu
        </h2>
        <p className="mt-1 text-xs font-medium leading-snug text-gray-500">
          Menü adresiniz için renkli, logolu QR kodu ve masa / oda numaralı, yazdırmaya hazır kartlar üretin. Adres hiç değişmez:
          daha önce bastığınız QR&apos;lar çalışmaya devam eder.
        </p>
        {!isLiveHost && (
          <p className="mt-3 flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-xs font-bold leading-snug text-amber-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            Şu an test adresindesiniz: üretilen QR&apos;lar bu test sitesine gider. Basılı kullanım için canlı panelden (app.tapmenu.com.tr) üretin.
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <section className="space-y-4 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm md:p-6">
            <h3 className="text-sm font-black text-gray-900">1. Kart etiketi</h3>
            <div role="radiogroup" aria-label="Etiket türü" className="grid grid-cols-3 gap-2">
              {LABEL_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={labelMode === m.id}
                  onClick={() => {
                    setLabelMode(m.id);
                    setPreviewIndex(0);
                    if (m.id === "oda" && labelInput === "1") setLabelInput("101");
                    if (m.id === "masa" && labelInput === "101") setLabelInput("1");
                  }}
                  className={`rounded-2xl border-2 px-3 py-2.5 text-left ${labelMode === m.id ? "border-blue-500 bg-blue-50" : "border-gray-100 bg-white hover:bg-gray-50"}`}
                >
                  <span className="block text-sm font-black text-gray-900">{m.label}</span>
                  <span className="block text-[11px] font-bold text-gray-500">{m.hint}</span>
                </button>
              ))}
            </div>
            {labelMode !== "none" && (
              <div>
                <label htmlFor="qr-label-input" className={labelClass}>
                  {labelMode === "oda" ? "Oda numaraları" : "Masa numaraları"}
                </label>
                <input
                  id="qr-label-input"
                  type="text"
                  value={labelInput}
                  onChange={(e) => {
                    setLabelInput(e.target.value);
                    setPreviewIndex(0);
                  }}
                  placeholder={labelMode === "oda" ? "101-120, 201-210" : "1-20"}
                  className={inputClass}
                />
                <p className="mt-1.5 text-[11px] font-bold leading-snug text-gray-500">
                  Tek numara (<b>5</b>), aralık (<b>1-20</b>) veya virgüllü liste (<b>1, 2, Bahçe 3</b>) yazabilirsiniz. En fazla {QR_LABEL_BATCH_MAX} kart.
                  Müşteri QR&apos;ı okutunca menünün üstünde “{labelKindWord(labelMode, "tr")} …” bilgisi görünür (sipariş sistemi değildir).
                </p>
                {expanded.error ? (
                  <p className="mt-1.5 text-xs font-bold text-red-600" role="alert">{expanded.error}</p>
                ) : (
                  <p className="mt-1.5 text-xs font-black text-emerald-700">{items.length} kart hazır</p>
                )}
              </div>
            )}
            {items.length > 1 && (
              <div>
                <label htmlFor="qr-preview-pick" className={labelClass}>Önizlenen kart</label>
                <select
                  id="qr-preview-pick"
                  value={safeIndex}
                  onChange={(e) => setPreviewIndex(Number(e.target.value))}
                  className={inputClass}
                >
                  {items.map((it, i) => (
                    <option key={`${it.value}-${i}`} value={i}>
                      {labelMode === "none" ? "Genel" : `${labelKindWord(labelMode, "tr")} ${it.value}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </section>

          <section className="space-y-4 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm md:p-6">
            <h3 className="text-sm font-black text-gray-900">2. QR görünümü</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ColorField label="QR rengi" value={foreground} onChange={setForeground} />
              <ColorField label="QR arka planı" value={background} onChange={setBackground} allowTransparent />
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { name: "Siyah-beyaz", fg: "#111827", bg: "#ffffff" },
                { name: "Marka rengi", fg: normalizeHexColor(brandColor, "#2563eb"), bg: "#ffffff" },
              ].map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => {
                    setForeground(p.fg);
                    setBackground(p.bg);
                  }}
                  className="rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-black text-gray-700 hover:bg-gray-200"
                >
                  {p.name}
                </button>
              ))}
            </div>
            {warning && (
              <p className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-xs font-bold leading-snug text-amber-800" role="status">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                {warning === "inverted"
                  ? "QR rengi arka plandan daha açık. Bazı telefonlar ters renkli kodu okuyamaz; koyu renk + açık zemin önerilir."
                  : "QR rengi ile arka plan arasındaki fark az. Okunmayabilir; daha koyu bir QR rengi seçin."}
              </p>
            )}
            {background === "transparent" && (
              <p className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-xs font-bold leading-snug text-amber-800" role="status">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                Şeffaf QR&apos;ı yalnızca açık renkli bir zemine yerleştirin; koyu zeminde okunmaz. Kartta QR her zaman açık bir panelin üstündedir.
              </p>
            )}
            <div>
              <span className={labelClass}>Nokta şekli</span>
              <div role="radiogroup" aria-label="Nokta şekli" className="flex flex-wrap gap-2">
                {SHAPES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={shape === s.id}
                    onClick={() => setShape(s.id)}
                    className={`rounded-xl border-2 px-3 py-1.5 text-xs font-black ${shape === s.id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-100 text-gray-600 hover:bg-gray-50"}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={`flex items-center gap-3 ${logoUrl ? "cursor-pointer" : "opacity-50"}`}>
                <input
                  type="checkbox"
                  checked={useLogo && Boolean(logoUrl)}
                  disabled={!logoUrl}
                  onChange={(e) => setUseLogo(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-sm font-black text-gray-900">Logomu QR&apos;ın ortasına ve kartın üstüne koy</span>
              </label>
              {!logoUrl && <p className="mt-1 text-[11px] font-bold text-gray-500">Önce Ayarlar bölümünden logo yükleyin.</p>}
              {logoUrl && logoState === "loading" && <p className="mt-1 text-[11px] font-bold text-gray-500">Logo hazırlanıyor…</p>}
              {logoUrl && logoState === "failed" && (
                <p className="mt-1 text-[11px] font-bold text-amber-700">Logo yüklenemedi, kod logosuz üretiliyor.</p>
              )}
              {logoForQr && (
                <p className="mt-1 text-[11px] font-bold leading-snug text-gray-500">
                  Logolu kodlar daha sık okunmaz hale gelebilir: basmadan önce telefonunuzla okutup deneyin.
                </p>
              )}
            </div>
          </section>

          <section className="space-y-4 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm md:p-6">
            <h3 className="text-sm font-black text-gray-900">3. Kart metni ve renk</h3>
            <div>
              <label htmlFor="qr-headline" className={labelClass}>Kart üzerindeki yazı</label>
              <input
                id="qr-headline"
                type="text"
                value={headline}
                maxLength={60}
                onChange={(e) => setHeadline(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ColorField label="Etiket bandı ve çerçeve rengi" value={accent} onChange={setAccent} />
              <label className="flex cursor-pointer items-center gap-3 self-end pb-3">
                <input type="checkbox" checked={showAddress} onChange={(e) => setShowAddress(e.target.checked)} className="h-4 w-4" />
                <span className="text-sm font-black text-gray-900">Kısa menü adresini yaz</span>
              </label>
            </div>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <section className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-black text-gray-900">Önizleme</h3>
            {cardPreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(cardPreview)}`}
                alt={current && labelMode !== "none" && current.value ? `${labelKindWord(labelMode, "tr")} ${current.value} kartı önizlemesi` : "Kart önizlemesi"}
                width={CARD_WIDTH}
                height={CARD_HEIGHT}
                className="mx-auto h-auto w-full max-w-[260px] rounded-2xl border border-gray-200 bg-white shadow-sm"
              />
            )}
            {current && baseUrl && (
              <p className="mt-3 break-all text-center text-[11px] font-bold text-gray-500">{current.url}</p>
            )}
          </section>

          <section className="space-y-3 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-black text-gray-900">İndir / yazdır</h3>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={!canAct} onClick={downloadQrPng} className="flex min-h-11 items-center justify-center gap-1.5 rounded-2xl bg-gray-900 px-3 text-xs font-black text-white hover:bg-black disabled:opacity-50">
                <Download size={14} /> QR (PNG)
              </button>
              <button type="button" disabled={!canAct} onClick={downloadQrSvg} className="flex min-h-11 items-center justify-center gap-1.5 rounded-2xl bg-gray-900 px-3 text-xs font-black text-white hover:bg-black disabled:opacity-50">
                <Download size={14} /> QR (SVG)
              </button>
              <button type="button" disabled={!canAct} onClick={downloadCardPng} className="flex min-h-11 items-center justify-center gap-1.5 rounded-2xl bg-gray-100 px-3 text-xs font-black text-gray-800 hover:bg-gray-200 disabled:opacity-50">
                <Download size={14} /> Kart (PNG)
              </button>
              <button type="button" disabled={!canAct} onClick={downloadCardSvg} className="flex min-h-11 items-center justify-center gap-1.5 rounded-2xl bg-gray-100 px-3 text-xs font-black text-gray-800 hover:bg-gray-200 disabled:opacity-50">
                <Download size={14} /> Kart (SVG)
              </button>
            </div>
            <p className="text-[11px] font-bold leading-snug text-gray-500">
              {items.length > 1 ? "İndirmeler önizlenen kart içindir. Hepsi için aşağıdaki yazdırma sayfasını kullanın. " : ""}
              SVG dosyasında yazı tipi sizin bilgisayarınızdaki yazı tipine göre görünür; baskı için PNG veya PDF önerilir.
            </p>
            <div className="border-t border-gray-100 pt-3">
              <label htmlFor="qr-layout" className={labelClass}>Sayfa düzeni</label>
              <select id="qr-layout" value={layout} onChange={(e) => setLayout(e.target.value as SheetLayout)} className={inputClass}>
                {(Object.keys(SHEET_LAYOUTS) as SheetLayout[]).map((k) => (
                  <option key={k} value={k}>{SHEET_LAYOUTS[k].label}</option>
                ))}
              </select>
              <button type="button" disabled={!canAct} onClick={printSheet} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50">
                <Printer size={16} /> {items.length > 1 ? `${items.length} kartı yazdır / PDF` : "Yazdır / PDF"}
              </button>
            </div>
            {items.length > 50 && (
              <p className="text-[11px] font-bold leading-snug text-amber-700">
                {items.length} kart hazırlanıyor; yazdırma penceresi birkaç saniye geç açılabilir. Çok kart için gruplara bölmek (örn. 1-50, 51-100) daha rahattır.
              </p>
            )}
            <p className="text-[11px] font-bold leading-snug text-gray-500">
              Çoğu yazıcı sayfa kenarına basamaz. Kart çerçevesi kesiliyorsa yazdırırken ölçeği %95 yapın veya “Sayfaya sığdır”ı seçin.
            </p>
            {message && (
              <p className={`text-xs font-bold leading-snug ${message.ok ? "text-emerald-700" : "text-red-600"}`} role="status">{message.text}</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
