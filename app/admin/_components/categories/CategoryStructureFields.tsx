"use client";

type CategoryOption = { id: string; name: string; parent_id?: string | null };

export type CategoryStructureValue = {
  parent_id: string;
  note: string;
  note_en: string;
  note_ru: string;
};

type Props = {
  value: CategoryStructureValue;
  onChange: (patch: Partial<CategoryStructureValue>) => void;
  categories: CategoryOption[];
  /** Düzenlenen kategori (yeni eklemede null). */
  editingCategoryId: string | null;
};

const NOTE_MAX = 500;

/**
 * Faz 2.2: kategoriyi başka bir kategorinin içinde "alt bölüm" olarak gösterme + kategori notu.
 * Tek seviye: alt bölümün altına bölüm eklenemez (veritabanı da engeller).
 */
export function CategoryStructureFields({ value, onChange, categories, editingCategoryId }: Props) {
  const hasChildren =
    editingCategoryId != null && categories.some((c) => c.parent_id === editingCategoryId);
  const parentOptions = categories.filter((c) => !c.parent_id && c.id !== editingCategoryId);

  return (
    <div className="p-4 md:p-5 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-3">
      <div className="space-y-1.5">
        <label
          htmlFor="category-parent"
          className="text-[10px] font-black text-emerald-700 uppercase tracking-widest"
        >
          Başka bir kategorinin içinde göster (isteğe bağlı)
        </label>
        <select
          id="category-parent"
          value={value.parent_id}
          disabled={hasChildren}
          onChange={(e) => onChange({ parent_id: e.target.value })}
          className="w-full bg-white p-3 rounded-xl text-sm font-bold outline-none shadow-sm disabled:opacity-60"
        >
          <option value="">Hayır — menüde ayrı sekme olsun</option>
          {parentOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} içinde
            </option>
          ))}
        </select>
        <p className="text-[11px] font-medium text-emerald-800/80 leading-snug">
          {hasChildren
            ? "Bu kategorinin içinde başka kategoriler var; kendisi bir kategorinin içine taşınamaz."
            : "Örn. “Pastalar” ve “Kekler”i “Tatlılar” içinde seçerseniz müşteri Tatlılar sekmesinde başlıklar halinde görür."}
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="category-note" className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">
          🇹🇷 Kategori notu (isteğe bağlı)
        </label>
        <textarea
          id="category-note"
          rows={2}
          maxLength={NOTE_MAX}
          placeholder="Örn: Tüm pizzalarımız odun ateşinde pişer."
          value={value.note}
          onChange={(e) => onChange({ note: e.target.value })}
          className="w-full bg-white p-3 rounded-xl text-sm font-medium outline-none shadow-sm"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <textarea
            aria-label="Kategori notu (İngilizce)"
            rows={2}
            maxLength={NOTE_MAX}
            placeholder="🇬🇧 Note"
            value={value.note_en}
            onChange={(e) => onChange({ note_en: e.target.value })}
            className="w-full bg-white p-3 rounded-xl text-xs md:text-sm font-medium outline-none"
          />
          <textarea
            aria-label="Kategori notu (Rusça)"
            rows={2}
            maxLength={NOTE_MAX}
            placeholder="🇷🇺 Примечание"
            value={value.note_ru}
            onChange={(e) => onChange({ note_ru: e.target.value })}
            className="w-full bg-white p-3 rounded-xl text-xs md:text-sm font-medium outline-none"
          />
        </div>
      </div>
    </div>
  );
}
