"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Edit3, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/app/admin/_components/ConfirmDialog";
import { ModifierGroupModal } from "@/app/admin/_components/modifiers/ModifierGroupModal";
import {
  deleteModifierGroup,
  emptyModifierGroup,
  listModifierGroups,
  saveModifierGroupOrder,
  type AdminModifierGroup,
} from "@/lib/admin-menu/modifiers";
import { describeSelectionRule, formatPriceDelta } from "@/lib/public-menu/product-extras";
import { getBrowserSupabase } from "@/lib/supabase/browser";

const supabase = getBrowserSupabase();

function ruleOf(g: AdminModifierGroup): string {
  const min = Number(g.min_select) || 0;
  const max = g.max_select.trim() ? Number(g.max_select) : null;
  return describeSelectionRule({ min_select: min, max_select: max }, "tr");
}

/** Faz 2.4: "Seçenek grupları" sekmesi — grubu bir kez tanımla, ürün formundan ürünlere bağla. */
export function ModifierGroupsPanel({ restaurantId }: { restaurantId: string }) {
  const [groups, setGroups] = useState<AdminModifierGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminModifierGroup | null>(null);
  const [deleting, setDeleting] = useState<AdminModifierGroup | null>(null);
  const [busy, setBusy] = useState(false);

  const applyResult = useCallback((res: Awaited<ReturnType<typeof listModifierGroups>>) => {
    if (res.ok) {
      setGroups(res.groups);
      setError(null);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }, []);

  const reload = useCallback(async () => {
    applyResult(await listModifierGroups(supabase, restaurantId));
  }, [restaurantId, applyResult]);

  useEffect(() => {
    let cancelled = false;
    listModifierGroups(supabase, restaurantId).then((res) => {
      if (!cancelled) applyResult(res);
    });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, applyResult]);

  const move = async (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= groups.length || busy) return;
    const next = [...groups];
    [next[index], next[j]] = [next[j], next[index]];
    setGroups(next);
    setBusy(true);
    const res = await saveModifierGroupOrder(supabase, next.map((g) => g.id!));
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      void reload();
    }
  };

  const confirmDelete = async () => {
    if (!deleting?.id) return;
    setBusy(true);
    const res = await deleteModifierGroup(supabase, deleting.id);
    setBusy(false);
    setDeleting(null);
    if (!res.ok) setError(res.error);
    void reload();
  };

  return (
    <div className="bg-white rounded-[2rem] p-4 md:p-8 shadow-sm border border-gray-100">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="font-black text-xl md:text-2xl text-gray-900 tracking-tighter">Seçenek grupları</h2>
          <p className="text-xs font-medium text-gray-500 mt-1 max-w-xl leading-snug">
            “Sos seçimi” ya da “Ekstralar” gibi grupları bir kez tanımlayın, ürün düzenlerken istediğiniz ürünlere
            bağlayın. Bir grubu değiştirince bağlı tüm ürünlerde değişir. Müşteri bunları ürün detayında görür.
          </p>
        </div>
        <button type="button" onClick={() => setEditing(emptyModifierGroup())}
          className="inline-flex items-center gap-1.5 bg-blue-600 text-white font-black text-sm px-4 min-h-11 rounded-2xl hover:bg-blue-700">
          <Plus size={18} /> Yeni grup
        </button>
      </div>

      {error && <p className="text-sm font-bold text-red-600 mb-3" role="alert">{error}</p>}
      {loading ? (
        <p className="text-sm text-gray-500 font-medium">Yükleniyor…</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-gray-500 font-medium bg-gray-50 rounded-2xl p-4">
          Henüz seçenek grubu yok. “Yeni grup” ile başlayın.
        </p>
      ) : (
        <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {groups.map((g, index) => {
            const active = g.options.filter((o) => o.is_active);
            return (
              <li key={g.id} className="p-3 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col gap-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-black text-gray-800 text-sm leading-snug">{g.name}</p>
                    <p className="text-[11px] font-bold text-gray-500">
                      {ruleOf(g)} · {g.product_count ?? 0} ürüne bağlı
                    </p>
                  </div>
                  <span className="flex items-center gap-0.5 shrink-0">
                    <button type="button" onClick={() => void move(index, -1)} disabled={busy || index === 0}
                      className="p-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 disabled:opacity-30" aria-label={`${g.name} yukarı taşı`}>
                      <ChevronUp size={15} />
                    </button>
                    <button type="button" onClick={() => void move(index, 1)} disabled={busy || index === groups.length - 1}
                      className="p-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 disabled:opacity-30" aria-label={`${g.name} aşağı taşı`}>
                      <ChevronDown size={15} />
                    </button>
                    <button type="button" onClick={() => setEditing(g)}
                      className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100" aria-label={`${g.name} düzenle`}>
                      <Edit3 size={15} />
                    </button>
                    <button type="button" onClick={() => setDeleting(g)}
                      className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100" aria-label={`${g.name} sil`}>
                      <Trash2 size={15} />
                    </button>
                  </span>
                </div>
                <p className="text-[11px] font-medium text-gray-600 line-clamp-2">
                  {active.length === 0
                    ? "Menüde gösterilen seçenek yok"
                    : active
                        .map((o) => {
                          const d = formatPriceDelta(o.price_delta);
                          return d ? `${o.name} (${d})` : o.name;
                        })
                        .join(" · ")}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <ModifierGroupModal
          restaurantId={restaurantId}
          initial={editing}
          sortOrder={groups.length}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}

      <ConfirmDialog
        open={deleting != null}
        title="Seçenek grubu silinsin mi?"
        message={
          deleting
            ? `“${deleting.name}” grubu ve seçenekleri silinecek${
                deleting.product_count ? `; ${deleting.product_count} üründen de kaldırılacak` : ""
              }. Bu işlem geri alınamaz.`
            : ""
        }
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
