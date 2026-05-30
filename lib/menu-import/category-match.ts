import type { ImportCategory, ImportProduct } from "@/lib/menu-import/schema";

export type ImportCategoryTargetMode = "create" | "existing";

export type ImportCategoryTargetInput = {
  import_index: number;
  mode: ImportCategoryTargetMode;
  existing_category_id?: string | null;
  name?: string;
  main_group?: string | null;
};

export type ResolvedCategoryTarget = {
  import_index: number;
  mode: ImportCategoryTargetMode;
  existing_category_id: string | null;
  name: string;
  main_group: string;
};

/** Türkçe büyük harf, trim, çoklu boşluk tek — kategori adı eşleştirme için. */
export function normalizeCategoryName(name: string): string {
  return name.trim().toLocaleUpperCase("tr-TR").replace(/\s+/g, " ");
}

/** Batch içi create target birleştirme anahtarı (ad + ana grup). */
export function createCategoryMergeKey(name: string, main_group: string): string {
  return `${normalizeCategoryName(name)}\0${resolveMainGroupForImport(main_group)}`;
}

export type MergedCommitCategoryUnit = {
  target: ResolvedCategoryTarget;
  products: ImportProduct[];
  source_indices: number[];
};

/**
 * mode=create hedeflerinde aynı normalize ad + main_group olanları tek birime indirger;
 * ürünleri sırayla birleştirir. existing hedefler ayrı kalır.
 */
export function mergeCreateCategoryTargetsInBatch(
  categories: ImportCategory[],
  targets: ResolvedCategoryTarget[]
): { units: MergedCommitCategoryUnit[]; categoriesMergedInBatch: number } {
  const targetsByIndex = new Map<number, ResolvedCategoryTarget>();
  for (const t of targets) {
    targetsByIndex.set(t.import_index, t);
  }

  const units: MergedCommitCategoryUnit[] = [];
  const createMergeMap = new Map<string, MergedCommitCategoryUnit>();
  let categoriesMergedInBatch = 0;

  for (let i = 0; i < categories.length; i++) {
    const target = targetsByIndex.get(i);
    if (!target) continue;

    const catProducts = categories[i]?.products ?? [];

    if (target.mode === "existing") {
      units.push({
        target,
        products: [...catProducts],
        source_indices: [i],
      });
      continue;
    }

    const key = createCategoryMergeKey(target.name, target.main_group);
    const mergedUnit = createMergeMap.get(key);
    if (mergedUnit) {
      mergedUnit.products.push(...catProducts);
      mergedUnit.source_indices.push(i);
      categoriesMergedInBatch++;
      continue;
    }

    const unit: MergedCommitCategoryUnit = {
      target,
      products: [...catProducts],
      source_indices: [i],
    };
    createMergeMap.set(key, unit);
    units.push(unit);
  }

  return { units, categoriesMergedInBatch };
}

/** Önizlemede birleştirilecek create target sayısı (ilk görülen hariç). */
export function countCreateTargetsMergedInBatch(
  targets: Array<{
    mode: ImportCategoryTargetMode;
    name: string;
    main_group: string;
  }>
): number {
  const seen = new Set<string>();
  let merged = 0;
  for (const t of targets) {
    if (t.mode !== "create") continue;
    const key = createCategoryMergeKey(t.name, t.main_group);
    if (seen.has(key)) merged++;
    else seen.add(key);
  }
  return merged;
}

export function resolveMainGroupForImport(
  main_group?: string | null,
  fallback?: string | null
): string {
  const raw = (main_group ?? fallback ?? "").trim();
  if (!raw) return "DİĞER";
  return raw.toLocaleUpperCase("tr-TR");
}

/** category_targets yokken: her AI satırı yeni kategori. */
export function buildCategoryTargetFallback(
  categories: ImportCategory[]
): ImportCategoryTargetInput[] {
  return categories.map((cat, import_index) => ({
    import_index,
    mode: "create" as const,
    existing_category_id: null,
    name: cat.name.trim(),
    main_group: cat.main_group,
  }));
}

export type SuggestedCategoryTarget = ImportCategoryTargetInput & {
  suggested_match_name: string | null;
};

/** Analyze sonrası otomatik hedef önerisi (exact name → existing). */
export function buildSuggestedCategoryTargets(
  categories: ImportCategory[],
  existingCategories: { id: string; name: string }[]
): SuggestedCategoryTarget[] {
  return categories.map((cat, import_index) => {
    const match = findExactCategoryMatch(cat.name, existingCategories);
    if (match) {
      return {
        import_index,
        mode: "existing",
        existing_category_id: match.id,
        name: cat.name.trim(),
        main_group: cat.main_group,
        suggested_match_name: match.name,
      };
    }
    return {
      import_index,
      mode: "create",
      existing_category_id: null,
      name: cat.name.trim(),
      main_group: cat.main_group,
      suggested_match_name: null,
    };
  });
}

/** Normalize edilmiş ad tam eşleşmesi. */
export function findExactCategoryMatch<T extends { id: string; name: string }>(
  aiName: string,
  existingCategories: T[]
): T | null {
  const key = normalizeCategoryName(aiName);
  if (!key) return null;
  return existingCategories.find((c) => normalizeCategoryName(c.name) === key) ?? null;
}

/**
 * payload.categories ile category_targets birleştirir.
 * Eksik import_index → create fallback. Yinelenen/geçersiz index → hata.
 */
export function resolveImportCategoryTargets(
  categories: ImportCategory[],
  targetsInput?: ImportCategoryTargetInput[] | null
): { ok: true; targets: ResolvedCategoryTarget[] } | { ok: false; error: string } {
  const categoryCount = categories.length;

  if (!targetsInput || targetsInput.length === 0) {
    return {
      ok: true,
      targets: buildCategoryTargetFallback(categories).map((t) => ({
        import_index: t.import_index,
        mode: "create",
        existing_category_id: null,
        name: t.name!.trim(),
        main_group: resolveMainGroupForImport(t.main_group, categories[t.import_index]?.main_group),
      })),
    };
  }

  const seen = new Set<number>();
  const byIndex = new Map<number, ImportCategoryTargetInput>();

  for (const t of targetsInput) {
    if (
      typeof t.import_index !== "number" ||
      !Number.isInteger(t.import_index) ||
      t.import_index < 0 ||
      t.import_index >= categoryCount
    ) {
      return { ok: false, error: `Geçersiz import_index: ${t.import_index}.` };
    }
    if (seen.has(t.import_index)) {
      return { ok: false, error: `Yinelenen import_index: ${t.import_index}.` };
    }
    seen.add(t.import_index);
    byIndex.set(t.import_index, t);
  }

  const targets: ResolvedCategoryTarget[] = [];

  for (let i = 0; i < categoryCount; i++) {
    const cat = categories[i];
    const input = byIndex.get(i);

    if (!input) {
      targets.push({
        import_index: i,
        mode: "create",
        existing_category_id: null,
        name: cat.name.trim(),
        main_group: resolveMainGroupForImport(cat.main_group),
      });
      continue;
    }

    if (input.mode === "existing") {
      const existingId = input.existing_category_id?.trim();
      if (!existingId) {
        return {
          ok: false,
          error: `import_index ${i}: mevcut kategori modunda existing_category_id zorunlu.`,
        };
      }
      targets.push({
        import_index: i,
        mode: "existing",
        existing_category_id: existingId,
        name: cat.name.trim(),
        main_group: resolveMainGroupForImport(cat.main_group),
      });
      continue;
    }

    const name = (input.name?.trim() || cat.name.trim());
    if (!name) {
      return { ok: false, error: `import_index ${i}: kategori adı zorunlu.` };
    }
    targets.push({
      import_index: i,
      mode: "create",
      existing_category_id: null,
      name,
      main_group: resolveMainGroupForImport(input.main_group, cat.main_group),
    });
  }

  return { ok: true, targets };
}
