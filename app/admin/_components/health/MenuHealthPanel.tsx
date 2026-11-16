"use client";

import { useMemo } from "react";
import { ArrowRight, CheckCircle2, FolderOpen, HeartPulse } from "lucide-react";
import {
  GRADE_LABELS,
  computeMenuHealth,
  topImprovements,
  type HealthCheck,
  type HealthFixTarget,
  type HealthGrade,
  type MenuHealthInput,
} from "@/lib/admin-menu/menu-health";

type Row = Record<string, unknown>;

type Props = {
  products: Row[];
  categories: Row[];
  variantsByProduct: MenuHealthInput["variantsByProduct"];
  translationLanguages: MenuHealthInput["translationLanguages"];
  venue: MenuHealthInput["venue"];
  /** Ürün düzenleme penceresini açar (panel sekmesi değişmez; kayıttan sonra skor güncellenir). */
  onEditProduct: (product: Row) => void;
  onGoTo: (target: "languages" | "settings" | "categories" | "products") => void;
};

const GRADE_STYLE: Record<HealthGrade, { ring: string; text: string; chip: string; sentence: string }> = {
  excellent: {
    ring: "stroke-emerald-500",
    text: "text-emerald-600",
    chip: "bg-emerald-50 text-emerald-700",
    sentence: "Menünüz çok iyi durumda. Misafirleriniz ihtiyaç duyduğu her bilgiyi görüyor.",
  },
  good: {
    ring: "stroke-blue-500",
    text: "text-blue-600",
    chip: "bg-blue-50 text-blue-700",
    sentence: "Menünüz iyi durumda. Aşağıdaki birkaç eksiği tamamlayınca mükemmel olur.",
  },
  fair: {
    ring: "stroke-amber-500",
    text: "text-amber-600",
    chip: "bg-amber-50 text-amber-700",
    sentence: "Menünüzde doldurabileceğiniz önemli eksikler var. En çok puan kazandıranlardan başlayın.",
  },
  poor: {
    ring: "stroke-red-500",
    text: "text-red-600",
    chip: "bg-red-50 text-red-700",
    sentence: "Menünüz henüz yeterince dolu değil. Önce fotoğraf ve açıklamaları tamamlayın.",
  },
};

const FIX_LABEL: Record<HealthFixTarget, string> = {
  product: "Ürünleri düzenle",
  languages: "Dil, Çeviri & Döviz sekmesine git",
  settings: "Görünüm Ayarları'na git",
};

function barColor(percent: number): string {
  if (percent >= 90) return "bg-emerald-500";
  if (percent >= 60) return "bg-amber-500";
  return "bg-red-500";
}

function ScoreRing({ score, grade }: { score: number; grade: HealthGrade }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const style = GRADE_STYLE[grade];
  return (
    <div className="relative h-36 w-36 shrink-0" role="img" aria-label={`Menü sağlık skoru 100 üzerinden ${score}`}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" strokeWidth="10" className="stroke-gray-100" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
          className={`${style.ring} transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-4xl font-black leading-none ${style.text}`}>{score}</span>
        <span className="mt-1 text-[10px] font-black uppercase tracking-widest text-gray-500">/ 100</span>
      </div>
    </div>
  );
}

function CheckCard({
  check,
  productsById,
  onEditProduct,
  onGoTo,
}: {
  check: HealthCheck;
  productsById: Map<string, Row>;
  onEditProduct: (product: Row) => void;
  onGoTo: Props["onGoTo"];
}) {
  const complete = check.percent >= 100;
  // Bilgi kartı (skora girmez): "eksik" değil "kontrol edin" dili, nötr renk.
  const info = !check.scored;
  const missing = check.missingProductIds
    .map((id) => productsById.get(id))
    .filter((p): p is Row => !!p);
  const shown = missing.slice(0, 12);

  return (
    <section className="rounded-3xl border-2 border-gray-100 bg-white p-4 md:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-xs md:text-sm font-black uppercase text-gray-900">
            {complete && <CheckCircle2 size={16} className="text-emerald-500 shrink-0" aria-hidden />}
            {check.label}
          </h3>
          <p className="mt-1 text-[11px] md:text-xs font-bold text-gray-500 leading-snug">{check.hint}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xl font-black text-gray-900 leading-none">%{check.percent}</p>
          <p className="mt-1 text-[10px] font-bold text-gray-500">
            {check.filled}/{check.total} {check.unit}
            {info ? " işaretli" : ""}
          </p>
        </div>
      </div>

      <div
        role="progressbar"
        aria-label={`${check.label} doluluk oranı`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={check.percent}
        aria-valuetext={`%${check.percent}, ${check.total - check.filled} ${check.unit} ${info ? "işaretsiz" : "eksik"}`}
        className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100"
      >
        <div className={`h-full rounded-full ${info ? "bg-blue-400" : barColor(check.percent)}`} style={{ width: `${check.percent}%` }} />
      </div>

      {!complete && check.potentialGain > 0 && (
        <p className="text-[11px] font-black text-blue-600">Tamamlarsanız skora yaklaşık +{check.potentialGain} puan</p>
      )}

      {!complete && check.fixTarget !== "product" && (
        <button
          type="button"
          onClick={() => onGoTo(check.fixTarget === "languages" ? "languages" : "settings")}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-50 px-4 text-xs font-black text-blue-700 hover:bg-blue-100"
        >
          {FIX_LABEL[check.fixTarget]} <ArrowRight size={14} aria-hidden />
        </button>
      )}

      {!complete && missing.length > 0 && (
        <details className="group rounded-2xl bg-gray-50 px-3 py-2">
          <summary className="min-h-11 cursor-pointer list-none py-2 text-xs font-black text-gray-700 flex items-center justify-between">
            <span>
              {info ? "Alerjen işaretlenmemiş ürünler" : "Eksik ürünler"} ({missing.length})
            </span>
            <span className="text-[10px] font-bold text-gray-500 group-open:hidden">Göster</span>
            <span className="hidden text-[10px] font-bold text-gray-500 group-open:inline">Gizle</span>
          </summary>
          <ul className="divide-y divide-gray-100">
            {shown.map((p) => (
              <li key={String(p.id)} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0 truncate text-xs font-bold text-gray-800">
                  {String(p.name ?? "") || "(adsız ürün)"}
                </span>
                <button
                  type="button"
                  aria-label={`${String(p.name ?? "") || "Adsız ürün"} ürününü düzenle`}
                  onClick={() => onEditProduct(p)}
                  className="min-h-11 shrink-0 rounded-lg px-3 text-xs font-black text-blue-600 hover:bg-blue-50"
                >
                  Düzenle
                </button>
              </li>
            ))}
          </ul>
          {missing.length > shown.length && (
            <p className="pb-2 pt-1 text-[11px] font-bold text-gray-500">
              ve {missing.length - shown.length} ürün daha. Birini tamamlayınca liste kısalır.
            </p>
          )}
        </details>
      )}
    </section>
  );
}

/** Faz 2.11b: menü sağlık skoru sekmesi. Hesap lib/admin-menu/menu-health.ts'te. */
export function MenuHealthPanel({
  products,
  categories,
  variantsByProduct,
  translationLanguages,
  venue,
  onEditProduct,
  onGoTo,
}: Props) {
  const health = useMemo(
    () => computeMenuHealth({ products, categories, variantsByProduct, translationLanguages, venue }),
    [products, categories, variantsByProduct, translationLanguages, venue]
  );
  const productsById = useMemo(() => new Map(products.map((p) => [String(p.id), p])), [products]);
  const improvements = useMemo(() => topImprovements(health, 3), [health]);

  if (health.score === null || health.grade === null) {
    return (
      <div className="rounded-3xl border-2 border-dashed border-gray-200 bg-white p-8 text-center space-y-3">
        <HeartPulse size={32} className="mx-auto text-gray-300" aria-hidden />
        <h2 className="text-sm font-black uppercase text-gray-900">Henüz değerlendirilecek ürün yok</h2>
        <p className="mx-auto max-w-md text-xs font-bold text-gray-500">
          Menünüzde yayında en az bir ürün olunca skorunuz burada görünür.
        </p>
        <button
          type="button"
          onClick={() => onGoTo("products")}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-black text-white hover:bg-blue-700"
        >
          Ürün ekle <ArrowRight size={14} aria-hidden />
        </button>
      </div>
    );
  }

  const style = GRADE_STYLE[health.grade];

  return (
    <div className="space-y-4 md:space-y-6">
      <section className="rounded-3xl border-2 border-gray-100 bg-white p-4 md:p-6">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
          <ScoreRing score={health.score} grade={health.grade} />
          <div className="min-w-0 flex-1 space-y-3 text-center sm:text-left">
            <div>
              <span className={`inline-block rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${style.chip}`}>
                {GRADE_LABELS[health.grade]}
              </span>
              <h2 className="mt-2 text-lg md:text-xl font-black text-gray-900">Menü sağlık skoru</h2>
              <p className="mt-1 text-xs md:text-sm font-bold text-gray-500 leading-snug">{style.sentence}</p>
              <p className="mt-1 text-[11px] font-bold text-gray-500">
                Müşterinin gördüğü {health.productCount} ürün üzerinden hesaplanır. Kapalı ürünler, kapalı kategoriler ve üst kategorisi kapalı alt kategoriler sayılmaz. Alerjen kartı bilgi amaçlıdır, skora girmez.
              </p>
            </div>
            {improvements.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">En çok puan kazandıranlar (yaklaşık)</p>
                <ul className="flex flex-wrap justify-center gap-2 sm:justify-start">
                  {improvements.map((c) => (
                    <li key={c.id} className="rounded-xl bg-gray-50 px-3 py-2 text-xs font-black text-gray-700">
                      {c.label} <span className="text-blue-600">+{c.potentialGain}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:gap-5 xl:grid-cols-2">
        {health.checks.map((check) => (
          <CheckCard
            key={check.id}
            check={check}
            productsById={productsById}
            onEditProduct={onEditProduct}
            onGoTo={onGoTo}
          />
        ))}
      </div>

      {health.emptyCategories.length > 0 && (
        <section className="rounded-3xl border-2 border-gray-100 bg-white p-4 md:p-5 space-y-3">
          <h3 className="flex items-center gap-2 text-xs md:text-sm font-black uppercase text-gray-900">
            <FolderOpen size={16} className="text-amber-500" aria-hidden /> Boş kategoriler ({health.emptyCategories.length})
          </h3>
          <p className="text-[11px] md:text-xs font-bold text-gray-500 leading-snug">
            İçinde yayında ürün olmayan kategoriler. Misafirler boş bir bölüm görmesin diye ürün ekleyin ya da kategoriyi kapatın.
            Bu liste skoru etkilemez.
          </p>
          <ul className="flex flex-wrap gap-2">
            {health.emptyCategories.map((c) => (
              <li key={c.id} className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-800">
                {c.name}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => onGoTo("categories")}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-50 px-4 text-xs font-black text-blue-700 hover:bg-blue-100"
          >
            Kategoriler sekmesine git <ArrowRight size={14} aria-hidden />
          </button>
        </section>
      )}
    </div>
  );
}
