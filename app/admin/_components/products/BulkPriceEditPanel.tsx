"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw, Save } from "lucide-react";
import {
  buildBulkPriceDrafts,
  bulkPriceProductKey,
  bulkPriceVariantKey,
  countEmptyPricesInGroups,
  countProductsInGroups,
  type BulkPriceProductGroup,
} from "@/lib/admin-menu/bulk-price-edit";
import {
  hasProductVariants,
  minActiveVariantPrice,
  sortProductVariantsByOrder,
  type ProductVariant,
} from "@/lib/admin-menu/product-variants";
import { getBrowserSupabase } from "@/lib/supabase/browser";

const supabase = getBrowserSupabase();

type BulkPriceEditPanelProps = {
  groups: BulkPriceProductGroup[];
  productVariantsMap: Record<string, ProductVariant[]>;
  menuBadgeForProduct: (productId: string) => string | null;
  onSaved: (payload: {
    productPrices: Record<string, string>;
    variantPrices: Record<string, string>;
    affectedProductIds: string[];
  }) => void;
};

export function BulkPriceEditPanel({
  groups,
  productVariantsMap,
  menuBadgeForProduct,
  onSaved,
}: BulkPriceEditPanelProps) {
  const allProducts = useMemo(() => groups.flatMap((g) => g.products), [groups]);

  const [productPrices, setProductPrices] = useState<Record<string, string>>({});
  const [variantPrices, setVariantPrices] = useState<Record<string, string>>({});
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const syncDraftsFromSource = useCallback(
    (preserveDirty: boolean) => {
      const next = buildBulkPriceDrafts(allProducts, productVariantsMap);
      if (!preserveDirty) {
        setProductPrices(next.productPrices);
        setVariantPrices(next.variantPrices);
        setDirtyKeys(new Set());
        return;
      }
      setProductPrices((prev) => ({ ...next.productPrices, ...prev }));
      setVariantPrices((prev) => ({ ...next.variantPrices, ...prev }));
    },
    [allProducts, productVariantsMap]
  );

  useEffect(() => {
    syncDraftsFromSource(true);
  }, [syncDraftsFromSource]);

  const totalProducts = countProductsInGroups(groups);
  const emptyCount = countEmptyPricesInGroups(groups, productVariantsMap);
  const changeCount = dirtyKeys.size;

  const markDirty = (key: string) => {
    setDirtyKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    setSuccess(null);
  };

  const handleReset = () => {
    syncDraftsFromSource(false);
    setError(null);
    setSuccess(null);
  };

  const handleSave = async () => {
    if (dirtyKeys.size === 0) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const affectedProductIds = new Set<string>();
      const savedProductPrices: Record<string, string> = {};
      const savedVariantPrices: Record<string, string> = {};

      for (const key of dirtyKeys) {
        if (key.startsWith("p:")) {
          const productId = key.slice(2);
          const price = (productPrices[productId] ?? "").trim();
          const { error: updateErr } = await supabase
            .from("products")
            .update({ price: price || "" })
            .eq("id", productId);
          if (updateErr) throw new Error(updateErr.message || "Ürün fiyatı güncellenemedi.");
          savedProductPrices[productId] = price || "";
          affectedProductIds.add(productId);
        } else if (key.startsWith("v:")) {
          const variantId = key.slice(2);
          const price = (variantPrices[variantId] ?? "").trim();
          const { error: updateErr } = await supabase
            .from("product_variants")
            .update({ price: price || "" })
            .eq("id", variantId);
          if (updateErr) throw new Error(updateErr.message || "Varyant fiyatı güncellenemedi.");
          savedVariantPrices[variantId] = price || "";

          const ownerVariant = Object.values(productVariantsMap)
            .flat()
            .find((v) => v.id === variantId);
          if (ownerVariant?.product_id) affectedProductIds.add(ownerVariant.product_id);
        }
      }

      for (const productId of affectedProductIds) {
        const variants = productVariantsMap[productId];
        if (!hasProductVariants(variants)) continue;

        const mergedVariants = sortProductVariantsByOrder(variants).map((variant) => ({
          price: dirtyKeys.has(bulkPriceVariantKey(variant.id))
            ? (variantPrices[variant.id] ?? "").trim() || ""
            : variant.price,
          is_active: variant.is_active,
        }));

        const minPrice = minActiveVariantPrice(mergedVariants);
        const { error: syncErr } = await supabase
          .from("products")
          .update({ price: minPrice })
          .eq("id", productId);
        if (syncErr) throw new Error(syncErr.message || "Ürün fiyat özeti güncellenemedi.");
        savedProductPrices[productId] = minPrice;
      }

      onSaved({
        productPrices: savedProductPrices,
        variantPrices: savedVariantPrices,
        affectedProductIds: [...affectedProductIds],
      });

      setDirtyKeys(new Set());
      setSuccess(`${changeCount} değişiklik kaydedildi.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fiyatlar kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  if (totalProducts === 0) {
    return (
      <div className="py-12 text-center text-sm font-medium text-gray-500">
        Fiyat düzenlemek için görünen ürün bulunamadı.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-gray-50/80 p-4 space-y-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-gray-600">
          <span>Toplam ürün: {totalProducts}</span>
          <span>Fiyatı boş: {emptyCount}</span>
          <span className={changeCount > 0 ? "text-amber-700" : ""}>
            Değişiklik: {changeCount}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || changeCount === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Değişiklikleri Kaydet
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={saving || changeCount === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm font-bold hover:bg-gray-50 disabled:opacity-50"
          >
            <RotateCcw size={16} />
            Değişiklikleri Sıfırla
          </button>
        </div>
        {error && (
          <p className="text-sm font-medium text-red-600" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="text-sm font-medium text-green-700" role="status">
            {success}
          </p>
        )}
      </div>

      <div className="space-y-5">
        {groups.map((group) => (
          <section key={group.categoryId} className="border border-gray-100 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
              <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">
                {group.categoryName} — {group.products.length} ürün
              </h3>
            </div>
            <div className="divide-y divide-gray-100">
              {group.products.map((product) => {
                const variants = productVariantsMap[product.id];
                const hasVariants = hasProductVariants(variants);
                const menuBadge = menuBadgeForProduct(product.id);
                const categoryName = product.categories?.name || group.categoryName;
                const productDirty = dirtyKeys.has(bulkPriceProductKey(product.id));

                return (
                  <div key={product.id} className="px-4 py-3 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm text-gray-900 leading-snug">{product.name}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded-md">
                            {categoryName}
                          </span>
                          {menuBadge && (
                            <span className="text-[9px] font-bold bg-teal-50 border border-teal-100 text-teal-800 px-1.5 py-0.5 rounded-md">
                              {menuBadge}
                            </span>
                          )}
                          {hasVariants && (
                            <span className="text-[9px] font-bold bg-violet-50 text-violet-700 border border-violet-100 px-1.5 py-0.5 rounded-md">
                              {variants!.length} seçenek
                            </span>
                          )}
                          {(productDirty ||
                            sortProductVariantsByOrder(variants ?? []).some((v) =>
                              dirtyKeys.has(bulkPriceVariantKey(v.id))
                            )) && (
                            <span className="text-[9px] font-black bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-md uppercase">
                              değişti
                            </span>
                          )}
                        </div>
                      </div>
                      {!hasVariants && (
                        <label className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                          <span className="text-[10px] font-bold text-gray-400 uppercase sm:sr-only">
                            Fiyat
                          </span>
                          <input
                            type="text"
                            value={productPrices[product.id] ?? ""}
                            onChange={(e) => {
                              setProductPrices((prev) => ({
                                ...prev,
                                [product.id]: e.target.value,
                              }));
                              markDirty(bulkPriceProductKey(product.id));
                            }}
                            placeholder="Fiyat"
                            className={`w-full sm:w-28 px-3 py-2 rounded-xl border-2 text-sm font-black text-blue-700 outline-none focus:border-blue-500 ${
                              productDirty ? "border-amber-300 bg-amber-50/50" : "border-gray-100 bg-white"
                            }`}
                          />
                        </label>
                      )}
                    </div>

                    {hasVariants && (
                      <div className="space-y-1.5 pl-0 sm:pl-2">
                        {sortProductVariantsByOrder(variants!).map((variant) => {
                          const variantDirty = dirtyKeys.has(bulkPriceVariantKey(variant.id));
                          return (
                            <div
                              key={variant.id}
                              className="flex items-center gap-2 sm:gap-3"
                            >
                              <span className="text-xs font-bold text-gray-600 min-w-[4.5rem] sm:min-w-[5rem] shrink-0">
                                {variant.label}
                              </span>
                              <input
                                type="text"
                                value={variantPrices[variant.id] ?? ""}
                                onChange={(e) => {
                                  setVariantPrices((prev) => ({
                                    ...prev,
                                    [variant.id]: e.target.value,
                                  }));
                                  markDirty(bulkPriceVariantKey(variant.id));
                                }}
                                placeholder="Fiyat"
                                className={`flex-1 sm:flex-none sm:w-28 px-3 py-2 rounded-xl border-2 text-sm font-black text-violet-700 outline-none focus:border-violet-400 ${
                                  variantDirty
                                    ? "border-amber-300 bg-amber-50/50"
                                    : "border-violet-100 bg-white"
                                }`}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
