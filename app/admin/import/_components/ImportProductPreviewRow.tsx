"use client";

import { Plus, Trash2 } from "lucide-react";
import type { ImportProduct, ImportVariant } from "@/lib/menu-import/schema";
import type { ProductMatchResult, ProductMergeAction } from "@/lib/menu-import/product-match";
import {
  MAX_IMPORT_VARIANTS,
  createEmptyImportVariant,
  hasImportProductVariants,
  resolveImportProductPrice,
} from "@/lib/menu-import/variant-templates";

type ImportProductPreviewRowProps = {
  product: ImportProduct;
  rowId: string;
  match: ProductMatchResult;
  mergeAction: ProductMergeAction;
  onChangeMergeAction: (action: ProductMergeAction) => void;
  onChangeName: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onChangePrice: (value: string) => void;
  onChangeVariants: (variants: ImportVariant[] | undefined) => void;
  onRemove: () => void;
};

function MatchBadge({ kind }: { kind: ProductMatchResult["kind"] }) {
  if (kind === "matched") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wide">
        Mevcut ürünle eşleşti
      </span>
    );
  }
  if (kind === "conflict") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900 text-[10px] font-black uppercase tracking-wide">
        Çakışma var
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-blue-100 text-blue-800 text-[10px] font-black uppercase tracking-wide">
      Yeni ürün
    </span>
  );
}

export function ImportProductPreviewRow({
  product,
  rowId,
  match,
  mergeAction,
  onChangeMergeAction,
  onChangeName,
  onChangeDescription,
  onChangePrice,
  onChangeVariants,
  onRemove,
}: ImportProductPreviewRowProps) {
  const hasVariants = hasImportProductVariants(product);
  const variants = product.variants ?? [];
  const importPrice = resolveImportProductPrice(product);
  const hasPriceConflict = match.conflicts.includes("price");
  const hasDescriptionConflict = match.conflicts.includes("description");
  const hasVariantConflict = match.conflicts.includes("variants");
  const radioName = `merge-${rowId}`;
  const effectiveAction =
    mergeAction === "update_from_import" && !hasPriceConflict
      ? "keep_existing"
      : mergeAction;

  const updateVariant = (index: number, field: "label" | "price", value: string) => {
    const next = variants.map((variant, i) =>
      i === index
        ? { ...variant, [field]: value.trim() === "" && field === "price" ? null : value }
        : variant
    );
    onChangeVariants(next);
  };

  const addVariant = () => {
    if (variants.length >= MAX_IMPORT_VARIANTS) return;
    const next = [...variants, createEmptyImportVariant()];
    onChangeVariants(next);
  };

  const removeVariant = (index: number) => {
    const next = variants.filter((_, i) => i !== index);
    onChangeVariants(next.length > 0 ? next : undefined);
  };

  const convertToVariants = () => {
    onChangeVariants([createEmptyImportVariant()]);
  };

  return (
    <li className="p-4 md:p-5 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <MatchBadge kind={match.kind} />
          {hasVariants && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-violet-100 text-violet-800 text-[10px] font-black uppercase tracking-wide">
              {variants.length} seçenek
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 ml-auto">
          {!hasVariants && (
            <button
              type="button"
              onClick={convertToVariants}
              className="text-xs font-bold text-violet-700 hover:bg-violet-50 px-2 py-1 rounded-lg"
            >
              Varyant ekle
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="text-gray-400 hover:text-red-500 p-1 rounded-lg"
            title="Ürünü sil"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {match.kind === "conflict" && match.existing && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 space-y-2">
          {hasPriceConflict && (
            <p className="text-xs font-bold text-amber-950">
              Mevcut ürün bulundu, fiyat farklı
              <span className="font-medium text-amber-900">
                {" "}
                (mevcut: {match.existing.price || "—"} · import: {importPrice || "—"})
              </span>
            </p>
          )}
          {hasDescriptionConflict && (
            <p className="text-xs font-medium text-amber-950">
              Açıklama mevcut üründen farklı. Mevcut açıklama korunacak (otomatik üzerine yazılmaz).
            </p>
          )}
          {hasVariantConflict && (
            <p className="text-xs font-medium text-amber-950">
              Varyantlar mevcut üründen farklı. Mevcut varyantlar korunacak.
            </p>
          )}
          <fieldset className="space-y-1.5 pt-1">
            <legend className="text-[10px] font-black uppercase tracking-wide text-amber-800">
              Ne yapılsın?
            </legend>
            <label className="flex items-center gap-2 text-xs font-medium text-amber-950">
              <input
                type="radio"
                name={radioName}
                checked={effectiveAction === "keep_existing"}
                onChange={() => onChangeMergeAction("keep_existing")}
                className="h-3.5 w-3.5"
              />
              Mevcut fiyatı koru
            </label>
            {hasPriceConflict && (
              <label className="flex items-center gap-2 text-xs font-medium text-amber-950">
                <input
                  type="radio"
                  name={radioName}
                  checked={effectiveAction === "update_from_import"}
                  onChange={() => onChangeMergeAction("update_from_import")}
                  className="h-3.5 w-3.5"
                />
                Import fiyatıyla güncelle
              </label>
            )}
            <label className="flex items-center gap-2 text-xs font-medium text-amber-950">
              <input
                type="radio"
                name={radioName}
                checked={effectiveAction === "create_separate"}
                onChange={() => onChangeMergeAction("create_separate")}
                className="h-3.5 w-3.5"
              />
              Ayrı ürün oluştur
            </label>
          </fieldset>
        </div>
      )}

      {match.kind === "matched" && match.existing && (
        <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
          Bu ürün restoranda zaten var. Yeni kayıt oluşturulmayacak; hedef menüye bağlanacak.
        </p>
      )}

      <input
        className="w-full border-2 border-gray-100 rounded-xl px-3 py-2 font-bold text-sm outline-none focus:border-blue-500"
        value={product.name}
        onChange={(e) => onChangeName(e.target.value)}
        placeholder="Ürün adı"
      />
      <input
        className="w-full border-2 border-gray-100 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500"
        value={product.description ?? ""}
        onChange={(e) => onChangeDescription(e.target.value)}
        placeholder="Açıklama (TR)"
      />

      {(product.name_en || product.name_ru || product.description_en || product.description_ru) && (
        <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-xs text-gray-600 space-y-1">
          {product.name_en && (
            <p>
              <span className="font-bold text-gray-500">EN:</span> {product.name_en}
              {product.description_en ? ` — ${product.description_en}` : ""}
            </p>
          )}
          {product.name_ru && (
            <p>
              <span className="font-bold text-gray-500">RU:</span> {product.name_ru}
              {product.description_ru ? ` — ${product.description_ru}` : ""}
            </p>
          )}
          {!product.name_en && product.description_en && (
            <p>
              <span className="font-bold text-gray-500">EN açıklama:</span> {product.description_en}
            </p>
          )}
          {!product.name_ru && product.description_ru && (
            <p>
              <span className="font-bold text-gray-500">RU açıklama:</span> {product.description_ru}
            </p>
          )}
        </div>
      )}

      {hasVariants ? (
        <div className="space-y-2 pt-1">
          {variants.map((variant, vi) => (
            <div
              key={`variant-${vi}`}
              className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-center"
            >
              <input
                className="w-full border-2 border-violet-100 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-violet-400"
                value={variant.label}
                onChange={(e) => updateVariant(vi, "label", e.target.value)}
                placeholder="Etiket (ör. 20 CL)"
              />
              <input
                className="w-full border-2 border-violet-100 rounded-xl px-3 py-2 text-sm font-black text-violet-700 outline-none focus:border-violet-400"
                value={variant.price ?? ""}
                onChange={(e) => updateVariant(vi, "price", e.target.value)}
                placeholder="Fiyat"
              />
              <button
                type="button"
                onClick={() => removeVariant(vi)}
                className="p-2 text-red-500 hover:bg-red-50 rounded-xl justify-self-end sm:justify-self-auto"
                title="Varyantı sil"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addVariant}
            disabled={variants.length >= MAX_IMPORT_VARIANTS}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-violet-200 bg-white text-violet-800 text-xs font-bold hover:bg-violet-50 disabled:opacity-50"
          >
            <Plus size={14} />
            Varyant ekle
          </button>
        </div>
      ) : (
        <input
          className="w-full border-2 border-gray-100 rounded-xl px-3 py-2 text-sm font-black text-blue-600 outline-none focus:border-blue-500"
          value={product.price ?? ""}
          onChange={(e) => onChangePrice(e.target.value)}
          placeholder="Fiyat"
        />
      )}
    </li>
  );
}
