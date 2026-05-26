"use client";

import {
  normalizeCategoryName,
  resolveMainGroupForImport,
  type ImportCategoryTargetMode,
} from "@/lib/menu-import/category-match";

export const MAIN_GROUP_PRESETS = ["YİYECEKLER", "İÇECEKLER", "TATLILAR", "DİĞER"] as const;

export type MainGroupPreset = (typeof MAIN_GROUP_PRESETS)[number] | "custom";

export type ExistingImportCategory = {
  id: string;
  name: string;
  main_group: string | null;
  product_count: number;
};

export type CategoryTargetUiState = {
  import_index: number;
  mode: ImportCategoryTargetMode;
  existing_category_id: string | null;
  name: string;
  main_group: string;
  main_group_preset: MainGroupPreset;
  main_group_custom: string;
  suggested_match_name: string | null;
};

type ImportCategoryTargetCardProps = {
  aiName: string;
  aiMainGroup: string | null;
  productCount: number;
  target: CategoryTargetUiState;
  existingCategories: ExistingImportCategory[];
  onChange: (next: CategoryTargetUiState) => void;
};

export function mainGroupToPreset(main_group: string | null | undefined): MainGroupPreset {
  const resolved = resolveMainGroupForImport(main_group);
  if ((MAIN_GROUP_PRESETS as readonly string[]).includes(resolved)) {
    return resolved as MainGroupPreset;
  }
  return "custom";
}

export function categoryTargetFromAi(
  import_index: number,
  aiName: string,
  aiMainGroup: string | null,
  suggested_match_name: string | null,
  existing_category_id: string | null,
  mode: ImportCategoryTargetMode
): CategoryTargetUiState {
  const main_group = resolveMainGroupForImport(aiMainGroup);
  const preset = mainGroupToPreset(main_group);
  return {
    import_index,
    mode,
    existing_category_id,
    name: aiName.trim(),
    main_group,
    main_group_preset: preset,
    main_group_custom: preset === "custom" ? main_group : "",
    suggested_match_name,
  };
}

export function ImportCategoryTargetCard({
  aiName,
  aiMainGroup,
  productCount,
  target,
  existingCategories,
  onChange,
}: ImportCategoryTargetCardProps) {
  const setMode = (mode: ImportCategoryTargetMode) => {
    if (mode === "existing") {
      const match =
        existingCategories.find(
          (c) => normalizeCategoryName(c.name) === normalizeCategoryName(aiName)
        ) ?? existingCategories.find((c) => c.id === target.existing_category_id);
      onChange({
        ...target,
        mode: "existing",
        existing_category_id: match?.id ?? target.existing_category_id,
      });
      return;
    }
    onChange({
      ...target,
      mode: "create",
      existing_category_id: null,
      name: target.name.trim() || aiName.trim(),
      main_group: resolveMainGroupForImport(target.main_group, aiMainGroup),
      main_group_preset: mainGroupToPreset(resolveMainGroupForImport(target.main_group, aiMainGroup)),
    });
  };

  const setPreset = (preset: MainGroupPreset) => {
    if (preset === "custom") {
      onChange({
        ...target,
        main_group_preset: "custom",
        main_group_custom: target.main_group_custom || target.main_group,
        main_group: target.main_group_custom || target.main_group,
      });
      return;
    }
    onChange({
      ...target,
      main_group_preset: preset,
      main_group: preset,
      main_group_custom: "",
    });
  };

  return (
    <div className="p-4 md:p-5 border-b border-indigo-100 bg-indigo-50/60 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">
            Kategori hedefi
          </p>
          <p className="text-sm font-black text-gray-900 mt-1">
            AI: {aiName}
            <span className="text-gray-500 font-bold ml-2">({productCount} ürün)</span>
          </p>
          {aiMainGroup && (
            <p className="text-[10px] font-bold text-gray-500 mt-0.5 uppercase">
              AI ana grup: {aiMainGroup}
            </p>
          )}
        </div>
        {target.suggested_match_name && target.mode === "existing" && (
          <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-lg shrink-0">
            Önerilen eşleşme: {target.suggested_match_name}
          </span>
        )}
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-3 p-3 rounded-xl border bg-white border-indigo-100 cursor-pointer">
          <input
            type="radio"
            name={`target-mode-${target.import_index}`}
            checked={target.mode === "create"}
            onChange={() => setMode("create")}
            className="h-4 w-4"
          />
          <span className="text-sm font-bold text-gray-800">Yeni kategori oluştur</span>
        </label>
        <label
          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${
            existingCategories.length === 0
              ? "opacity-50 pointer-events-none bg-gray-50 border-gray-100"
              : "bg-white border-indigo-100"
          }`}
        >
          <input
            type="radio"
            name={`target-mode-${target.import_index}`}
            checked={target.mode === "existing"}
            disabled={existingCategories.length === 0}
            onChange={() => setMode("existing")}
            className="h-4 w-4"
          />
          <span className="text-sm font-bold text-gray-800">Mevcut kategoriye ekle</span>
        </label>
      </div>

      {target.mode === "existing" && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 leading-relaxed">
            Ürünler mevcut kategoriye eklenecek; yeni kategori oluşturulmayacak.
          </p>
          <label className="block">
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-wide mb-1 block">
              Mevcut kategori
            </span>
            <select
              required
              className="w-full border-2 border-white bg-white rounded-xl px-3 py-2.5 text-sm font-bold text-gray-900 outline-none focus:border-indigo-400"
              value={target.existing_category_id ?? ""}
              onChange={(e) =>
                onChange({
                  ...target,
                  existing_category_id: e.target.value || null,
                })
              }
            >
              <option value="">Kategori seçin…</option>
              {existingCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.main_group || "DİĞER"}
                  {c.product_count > 0 ? ` · ${c.product_count} ürün` : ""})
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {target.mode === "create" && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-wide mb-1 block">
              Kategori adı
            </span>
            <input
              required
              className="w-full border-2 border-white bg-white rounded-xl px-3 py-2 font-black text-gray-900 outline-none focus:border-indigo-400"
              value={target.name}
              onChange={(e) => onChange({ ...target, name: e.target.value })}
            />
          </label>
          <div className="space-y-2">
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-wide block">
              Ana grup
            </span>
            <select
              className="w-full border-2 border-white bg-white rounded-xl px-3 py-2 text-sm font-bold text-gray-900 outline-none focus:border-indigo-400"
              value={target.main_group_preset}
              onChange={(e) => setPreset(e.target.value as MainGroupPreset)}
            >
              {MAIN_GROUP_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
              <option value="custom">Özel</option>
            </select>
            {target.main_group_preset === "custom" && (
              <input
                placeholder="Özel ana grup"
                className="w-full border-2 border-white bg-white rounded-xl px-3 py-2 text-sm font-bold text-gray-700 outline-none focus:border-indigo-400 uppercase"
                value={target.main_group_custom}
                onChange={(e) => {
                  const v = e.target.value.toLocaleUpperCase("tr-TR");
                  onChange({
                    ...target,
                    main_group_custom: v,
                    main_group: v,
                  });
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
