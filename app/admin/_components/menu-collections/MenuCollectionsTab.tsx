"use client";

import { useCallback, useEffect, useState } from "react";
import { Edit3, LayoutGrid, Loader2, Plus, Power, PowerOff, Trash2, X } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { AdminMenuCollectionListItem } from "@/lib/admin-menu/types";
import {
  emptyMenuCollectionForm,
  formValuesFromItem,
  MenuCollectionFormModal,
  type MenuCollectionFormValues,
} from "@/app/admin/_components/menu-collections/MenuCollectionFormModal";

const supabase = getBrowserSupabase();

type MenuCollectionsTabProps = {
  restaurantId: string;
};

function formatHours(item: AdminMenuCollectionListItem): string | null {
  if (item.start_time && item.end_time) {
    const start = item.start_time.slice(0, 5);
    const end = item.end_time.slice(0, 5);
    return `${start} — ${end}`;
  }
  return item.description?.trim() || null;
}

export function MenuCollectionsTab({ restaurantId }: MenuCollectionsTabProps) {
  const [items, setItems] = useState<AdminMenuCollectionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<MenuCollectionFormValues>(emptyMenuCollectionForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [toggleBusyId, setToggleBusyId] = useState<string | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<AdminMenuCollectionListItem | null>(
    null
  );
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);

  const activeCount = items.filter((m) => m.is_active).length;
  const showSingleMenuHint = activeCount <= 1;

  const canDeleteMenu = (item: AdminMenuCollectionListItem): boolean => {
    if (items.length <= 1) return false;
    if (item.is_active && activeCount <= 1) return false;
    return true;
  };

  const deleteDisabledReason = (item: AdminMenuCollectionListItem): string | null => {
    if (items.length <= 1) return "Son menü silinemez.";
    if (item.is_active && activeCount <= 1) return "En az bir aktif menü kalmalıdır.";
    return null;
  };

  const loadItems = useCallback(async () => {
    setListError(null);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setListError("Oturum bulunamadı.");
      setItems([]);
      return;
    }

    const res = await fetch(
      `/api/admin/menu-collections?restaurantId=${encodeURIComponent(restaurantId)}`,
      { headers: { Authorization: `Bearer ${session.access_token}` } }
    );
    const json = (await res.json()) as { items?: AdminMenuCollectionListItem[]; error?: string };
    if (!res.ok) {
      setListError(json.error || "Menüler yüklenemedi.");
      setItems([]);
      return;
    }
    setItems(json.items || []);
  }, [restaurantId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await loadItems();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadItems]);

  const openCreate = () => {
    setEditingId(null);
    setFormValues(emptyMenuCollectionForm());
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (item: AdminMenuCollectionListItem) => {
    setEditingId(item.id);
    setFormValues(formValuesFromItem(item));
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (formBusy) return;
    setModalOpen(false);
    setEditingId(null);
    setFormError(null);
  };

  const handleSubmit = async () => {
    setFormError(null);
    setFormBusy(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Oturum bulunamadı.");

      const payload = {
        name: formValues.name.trim(),
        name_en: formValues.name_en.trim() || null,
        name_ru: formValues.name_ru.trim() || null,
        description: formValues.description.trim() || null,
        start_time: formValues.start_time || null,
        end_time: formValues.end_time || null,
        is_active: formValues.is_active,
      };

      if (editingId) {
        const res = await fetch(`/api/admin/menu-collections/${encodeURIComponent(editingId)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        });
        const json = (await res.json()) as { item?: AdminMenuCollectionListItem; error?: string };
        if (!res.ok) throw new Error(json.error || "Güncellenemedi.");
        if (json.item) {
          setItems((prev) => prev.map((m) => (m.id === json.item!.id ? json.item! : m)));
        }
      } else {
        const res = await fetch("/api/admin/menu-collections", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ restaurantId, ...payload }),
        });
        const json = (await res.json()) as { item?: AdminMenuCollectionListItem; error?: string };
        if (!res.ok) throw new Error(json.error || "Oluşturulamadı.");
        if (json.item) {
          setItems((prev) => [...prev, json.item!].sort((a, b) => a.sort_order - b.sort_order));
        }
      }
      setModalOpen(false);
      setEditingId(null);
      setFormError(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Hata");
    } finally {
      setFormBusy(false);
    }
  };

  const handleDelete = async (item: AdminMenuCollectionListItem) => {
    if (deleteBusyId || !canDeleteMenu(item)) return;
    setDeleteBusyId(item.id);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Oturum bulunamadı.");

      const res = await fetch(`/api/admin/menu-collections/${encodeURIComponent(item.id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Silinemedi.");
      }
      setDeleteConfirmItem(null);
      await loadItems();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Silinemedi.");
    } finally {
      setDeleteBusyId(null);
    }
  };

  const handleToggleActive = async (item: AdminMenuCollectionListItem) => {
    if (toggleBusyId) return;
    setToggleBusyId(item.id);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Oturum bulunamadı.");

      const res = await fetch(`/api/admin/menu-collections/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ is_active: !item.is_active }),
      });
      const json = (await res.json()) as { item?: AdminMenuCollectionListItem; error?: string };
      if (!res.ok) throw new Error(json.error || "Güncellenemedi.");
      if (json.item) {
        setItems((prev) => prev.map((m) => (m.id === json.item!.id ? json.item! : m)));
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Güncellenemedi.");
    } finally {
      setToggleBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 font-bold gap-2">
        <Loader2 className="h-6 w-6 animate-spin" />
        Menüler yükleniyor…
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 md:p-8">
      <div className="flex flex-col md:flex-row justify-between md:items-start gap-4 mb-6">
        <div>
          <h2 className="text-lg md:text-xl font-black text-gray-900 uppercase flex items-center gap-2">
            <LayoutGrid size={22} className="text-blue-600" />
            Menüler
          </h2>
          <p className="text-xs text-gray-500 font-medium mt-2 max-w-xl leading-relaxed">
            Müşteri QR menüsünde gösterilecek menü koleksiyonlarını yönetin. İki veya daha fazla aktif
            menü olduğunda müşteri önce menü seçer.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="w-full md:w-auto shrink-0 bg-blue-600 text-white px-5 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-100"
        >
          <Plus size={20} />
          Yeni menü
        </button>
      </div>

      {showSingleMenuHint && (
        <div className="mb-6 p-4 md:p-5 rounded-2xl bg-blue-50 border border-blue-100 text-sm text-blue-900 font-medium leading-relaxed">
          Şu anda tek menü yayında. İsterseniz öğle, akşam veya içecek gibi ek menüler
          oluşturabilirsiniz; müşteri menüsünde seçim ekranı açılır.
        </div>
      )}

      {listError && (
        <p className="mb-4 text-sm font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          {listError}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        {items.map((item) => {
          const hours = formatHours(item);
          const toggling = toggleBusyId === item.id;
          const deletable = canDeleteMenu(item);
          const deleteReason = deleteDisabledReason(item);
          const deleting = deleteBusyId === item.id;
          return (
            <div
              key={item.id}
              className={`p-4 md:p-5 rounded-2xl border flex flex-col gap-3 transition-all ${
                item.is_active
                  ? "border-gray-100 bg-gray-50"
                  : "border-amber-100 bg-amber-50/40 opacity-90"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-lg font-black text-gray-900 truncate">{item.name}</p>
                  {hours && (
                    <p className="text-sm text-gray-500 font-medium mt-0.5 tabular-nums">{hours}</p>
                  )}
                </div>
                <span
                  className={`shrink-0 text-[9px] font-black uppercase tracking-wide px-2 py-1 rounded-md ${
                    item.is_active
                      ? "bg-green-100 text-green-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {item.is_active ? "Aktif" : "Pasif"}
                </span>
              </div>

              <p className="text-[10px] font-bold text-gray-500">
                {item.category_count} kategori bağlı
              </p>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => openEdit(item)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black bg-white border border-gray-200 text-gray-700 hover:bg-gray-100"
                >
                  <Edit3 size={14} />
                  Düzenle
                </button>
                <button
                  type="button"
                  disabled={toggling}
                  onClick={() => void handleToggleActive(item)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black border ${
                    item.is_active
                      ? "bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100"
                      : "bg-green-50 border-green-200 text-green-800 hover:bg-green-100"
                  }`}
                >
                  {toggling ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : item.is_active ? (
                    <PowerOff size={14} />
                  ) : (
                    <Power size={14} />
                  )}
                  {item.is_active ? "Pasifleştir" : "Aktifleştir"}
                </button>
                <button
                  type="button"
                  disabled={!deletable || deleting || toggling}
                  title={deleteReason ?? "Menüyü sil"}
                  onClick={() => setDeleteConfirmItem(item)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black border border-red-100 bg-red-50/80 text-red-700 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-red-50/80"
                >
                  {deleting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                  Sil
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {items.length === 0 && !listError && (
        <p className="text-center text-sm font-bold text-gray-400 py-8">
          Henüz menü yok. İlk menünüzü oluşturun.
        </p>
      )}

      <MenuCollectionFormModal
        open={modalOpen}
        title={editingId ? "Menüyü düzenle" : "Yeni menü"}
        values={formValues}
        busy={formBusy}
        error={formError}
        onChange={setFormValues}
        onClose={closeModal}
        onSubmit={() => void handleSubmit()}
      />

      {deleteConfirmItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div
            className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-gray-100 overflow-hidden"
            role="dialog"
            aria-labelledby="delete-menu-title"
          >
            <div className="p-6 border-b border-gray-100 flex justify-between items-start gap-3">
              <div>
                <h3 id="delete-menu-title" className="font-black text-lg text-gray-900">
                  Menüyü sil
                </h3>
                <p className="text-sm font-bold text-gray-600 mt-1">
                  «{deleteConfirmItem.name}»
                </p>
              </div>
              <button
                type="button"
                onClick={() => !deleteBusyId && setDeleteConfirmItem(null)}
                disabled={Boolean(deleteBusyId)}
                className="text-gray-400 hover:text-gray-900 bg-gray-100 p-2 rounded-full shrink-0 disabled:opacity-40"
                aria-label="Kapat"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4 text-sm text-gray-700 leading-relaxed">
              <p>
                Bu menü silinecek. <strong>Kategoriler ve ürünler silinmez</strong>; yalnızca bu
                menüde görünmeleri kaldırılır.
              </p>
              {deleteConfirmItem.category_count > 0 && (
                <p className="text-xs font-medium text-amber-900 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                  {deleteConfirmItem.category_count} kategori bu menüye bağlı; bağlantılar
                  kaldırılır, kategoriler panelde kalır.
                </p>
              )}
            </div>
            <div className="p-6 pt-0 flex gap-3">
              <button
                type="button"
                disabled={Boolean(deleteBusyId)}
                onClick={() => setDeleteConfirmItem(null)}
                className="flex-1 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 disabled:opacity-40"
              >
                İptal
              </button>
              <button
                type="button"
                disabled={Boolean(deleteBusyId)}
                onClick={() => void handleDelete(deleteConfirmItem)}
                className="flex-1 py-3 rounded-xl font-black bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
              >
                {deleteBusyId ? "Siliniyor…" : "Evet, sil"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
