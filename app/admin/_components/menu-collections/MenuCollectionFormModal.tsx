"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, Loader2, Trash2, X } from "lucide-react";
import type {
  AdminMenuCollectionListItem,
  MenuCollectionCardVisualType,
} from "@/lib/admin-menu/types";
import { PRODUCT_IMAGE_ACCEPT } from "@/lib/admin-menu/product-image-upload";
import { getMenuCollectionEmoji } from "@/lib/public-menu/display";
import {
  croppedBlobToFile,
  validateImageSourceFile,
} from "@/lib/images/crop-image";
import { ImageCropModal } from "@/app/admin/_components/images/ImageCropModal";
import { ScheduleEditor } from "@/app/admin/_components/schedule/ScheduleEditor";
import { emptyScheduleDraft, type Schedule } from "@/lib/public-menu/schedule";
import type { TranslationLanguage } from "@/lib/i18n/languages";
import type { TranslationMap } from "@/lib/i18n/translations";
import { getTranslationField, setTranslationField } from "@/lib/i18n/edit-translations";
import { applyAiResults, entitiesTranslationStatus, type TranslatableEntity } from "@/lib/admin-menu/form-ai-translate";
import { TranslationSection, translationInputClass } from "@/app/admin/_components/i18n/TranslationTabs";
import { useFormAiTranslate } from "@/app/admin/_components/i18n/useFormAiTranslate";

export type MenuCollectionFormValues = {
  name: string;
  /** Faz 2.5b: ad + açıklama çevirileri. */
  translations: TranslationMap;
  description: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
  card_visual_type: MenuCollectionCardVisualType;
  /** Saved / remote card image URL. */
  card_image_url: string | null;
  /** Local file pending upload (not persisted until submit). */
  card_image_file: File | null;
  /** When true on save, clear card_image_url even without a new file. */
  remove_card_image: boolean;
  /** Faz 2.3 servis zamanı; null = her zaman. */
  schedule: Schedule | null;
};

export function emptyMenuCollectionForm(): MenuCollectionFormValues {
  return {
    name: "",
    translations: {},
    description: "",
    start_time: "",
    end_time: "",
    is_active: true,
    card_visual_type: "icon",
    card_image_url: null,
    card_image_file: null,
    remove_card_image: false,
    schedule: null,
  };
}

export function formValuesFromItem(item: AdminMenuCollectionListItem): MenuCollectionFormValues {
  return {
    name: item.name,
    translations: item.translations ?? {},
    description: item.description || "",
    start_time: toTimeInput(item.start_time),
    end_time: toTimeInput(item.end_time),
    is_active: item.is_active,
    card_visual_type: item.card_visual_type || "icon",
    card_image_url: item.card_image_url || null,
    card_image_file: null,
    remove_card_image: false,
    schedule: item.schedule ?? null,
  };
}

function toTimeInput(value: string | null): string {
  if (!value) return "";
  return value.length >= 5 ? value.slice(0, 5) : value;
}

const VISUAL_OPTIONS: { id: MenuCollectionCardVisualType; label: string }[] = [
  { id: "icon", label: "İkon" },
  { id: "image", label: "Görsel" },
  { id: "none", label: "Sade" },
];

type MenuCollectionFormModalProps = {
  open: boolean;
  title: string;
  values: MenuCollectionFormValues;
  busy: boolean;
  error: string | null;
  onChange: (values: MenuCollectionFormValues) => void;
  onClose: () => void;
  onSubmit: () => void;
  restaurantId: string;
  /** Menüde açık çeviri dilleri (TR hariç). */
  translationLanguages: readonly TranslationLanguage[];
};

export function MenuCollectionFormModal({
  open,
  title,
  values,
  busy,
  error,
  onChange,
  onClose,
  onSubmit,
  restaurantId,
  translationLanguages,
}: MenuCollectionFormModalProps) {
  const ai = useFormAiTranslate(restaurantId);
  const resetAi = ai.reset;
  useEffect(() => {
    if (!open) resetAi();
  }, [open, resetAi]);
  const menuEntity = (): TranslatableEntity => ({
    id: "menu",
    kind: "menu",
    source: { name: values.name, description: values.description },
    translations: values.translations,
  });
  // AI yanıtı gelene kadar form değişmiş olabilir: sonucu en güncel değere uygula.
  const valuesRef = useRef(values);
  useEffect(() => {
    valuesRef.current = values;
  }, [values]);
  const fillWithAi = () => {
    void ai.run([menuEntity()], translationLanguages, (results) => {
      const latest = valuesRef.current;
      onChange({ ...latest, translations: applyAiResults(latest.translations, results, "menu") });
    });
  };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropSession, setCropSession] = useState<{
    imageSrc: string;
    sourceFileName: string;
  } | null>(null);
  const [imagePickError, setImagePickError] = useState<string | null>(null);

  const closeCropSession = useCallback(() => {
    setCropSession((current) => {
      if (current?.imageSrc) URL.revokeObjectURL(current.imageSrc);
      return null;
    });
  }, []);

  useEffect(() => {
    if (open) return;
    closeCropSession();
    setImagePickError(null);
  }, [open, closeCropSession]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.classList.add("admin-modal-open");
    document.body.style.overflow = "hidden";
    return () => {
      document.body.classList.remove("admin-modal-open");
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const localPreviewUrl = useMemo(() => {
    if (!values.card_image_file) return null;
    return URL.createObjectURL(values.card_image_file);
  }, [values.card_image_file]);

  useEffect(() => {
    if (!localPreviewUrl) return;
    return () => URL.revokeObjectURL(localPreviewUrl);
  }, [localPreviewUrl]);

  if (!open) return null;

  const set = (patch: Partial<MenuCollectionFormValues>) => onChange({ ...values, ...patch });

  const previewSrc =
    localPreviewUrl ||
    (!values.remove_card_image && values.card_image_url ? values.card_image_url : null);
  const emojiPreview = getMenuCollectionEmoji({ name: values.name || "Menü" });

  const setVisualType = (type: MenuCollectionCardVisualType) => {
    if (type === "image") {
      set({ card_visual_type: type });
      return;
    }
    closeCropSession();
    setImagePickError(null);
    set({
      card_visual_type: type,
      card_image_file: null,
      remove_card_image: type === "none" ? true : values.remove_card_image,
    });
  };

  const handleImageFileSelected = (file: File) => {
    const validationError = validateImageSourceFile(file);
    if (validationError) {
      setImagePickError(validationError);
      return;
    }
    closeCropSession();
    setImagePickError(null);
    setCropSession({
      imageSrc: URL.createObjectURL(file),
      sourceFileName: file.name,
    });
  };

  const handleCropConfirm = (blob: Blob) => {
    const croppedFile = croppedBlobToFile(blob, cropSession?.sourceFileName ?? "menu-card");
    set({
      card_image_file: croppedFile,
      remove_card_image: false,
    });
    closeCropSession();
    setImagePickError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center overflow-hidden pt-[max(0.75rem,env(safe-area-inset-top))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] md:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Kapat"
        onClick={() => !busy && onClose()}
      />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col min-h-0 max-h-[calc(100dvh-env(safe-area-inset-top,0px)-0.75rem)] md:max-h-[90dvh] overflow-hidden">
        <div className="shrink-0 bg-white border-b border-gray-100 px-5 py-3 md:py-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-black text-gray-900 min-w-0 truncate">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex items-center justify-center min-h-11 min-w-11 rounded-xl text-gray-400 hover:bg-gray-100 disabled:opacity-40"
            aria-label="Kapat"
          >
            <X size={20} />
          </button>
        </div>

        <form
          className="flex flex-col flex-1 min-h-0"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-5 space-y-4">
            {error && (
              <p className="text-sm font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                {error}
              </p>
            )}

            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                Menü adı (TR) *
              </span>
              <input
                required
                value={values.name}
                onChange={(e) => set({ name: e.target.value })}
                className="mt-1 w-full max-w-full min-w-0 min-h-11 border-2 border-gray-100 rounded-xl px-4 py-3 font-bold text-gray-900 outline-none focus:border-blue-500"
                placeholder="Örn. Akşam Menüsü"
              />
            </label>

            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                Açıklama
              </span>
              <textarea
                value={values.description}
                onChange={(e) => set({ description: e.target.value })}
                rows={2}
                className="mt-1 w-full max-w-full min-w-0 min-h-11 box-border resize-y border-2 border-gray-100 rounded-xl px-4 py-3 font-medium outline-none focus:border-blue-500"
              />
            </label>

            <TranslationSection
              languages={translationLanguages}
              statusFor={(lang) => entitiesTranslationStatus([menuEntity()], lang)}
              onAiFill={fillWithAi}
              aiBusy={ai.busy}
              aiMessage={ai.message}
            >
              {(lang) => (
                <>
                  <input
                    className={translationInputClass}
                    placeholder={values.name || "Menü adı"}
                    aria-label="Menü adı çevirisi"
                    maxLength={120}
                    value={getTranslationField(values.translations, lang, "name")}
                    onChange={(e) =>
                      set({ translations: setTranslationField(values.translations, lang, "name", e.target.value) })
                    }
                  />
                  {values.description.trim() && (
                    <textarea
                      className={`${translationInputClass} resize-y font-medium`}
                      rows={2}
                      placeholder={values.description}
                      aria-label="Açıklama çevirisi"
                      maxLength={500}
                      value={getTranslationField(values.translations, lang, "description")}
                      onChange={(e) =>
                        set({ translations: setTranslationField(values.translations, lang, "description", e.target.value) })
                      }
                    />
                  )}
                </>
              )}
            </TranslationSection>

            {values.start_time && values.end_time && !values.schedule && (
              <div className="rounded-2xl border-2 border-gray-100 bg-gray-50 p-3 space-y-2">
                <p className="text-xs font-bold text-gray-600 leading-relaxed">
                  Eski saat bilgisi: <b>{values.start_time} – {values.end_time}</b>. Bu yalnızca menü kartında yazı olarak
                  görünüyor, menüyü saate göre açıp kapatmıyor.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    set({
                      schedule: {
                        ...emptyScheduleDraft(),
                        windows: [
                          { days: [0, 1, 2, 3, 4, 5, 6], start: values.start_time, end: values.end_time },
                        ],
                      },
                      start_time: "",
                      end_time: "",
                    })
                  }
                  className="min-h-11 rounded-xl bg-white border-2 border-gray-100 px-3 py-2 text-xs font-black text-blue-700 hover:border-blue-200"
                >
                  Bu saatleri servis zamanı olarak uygula
                </button>
              </div>
            )}

            <ScheduleEditor
              subject="menü"
              value={values.schedule}
              onChange={(schedule) => set({ schedule })}
            />

            <div className="p-3 md:p-4 rounded-2xl border border-violet-100 bg-violet-50/50 space-y-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-violet-700">
                  Menü kartı görünümü
                </p>
                <p className="text-xs text-violet-900/70 font-medium mt-1 leading-relaxed">
                  Ana menü seçim ekranındaki kartın sol görseli. Her menü için ayrı ayarlanır.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {VISUAL_OPTIONS.map((opt) => {
                  const active = values.card_visual_type === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={busy}
                      onClick={() => setVisualType(opt.id)}
                      className={`min-h-11 rounded-xl text-xs font-black border transition-colors ${
                        active
                          ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                          : "bg-white text-violet-800 border-violet-200 hover:bg-violet-50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {values.card_visual_type === "icon" && (
                <div className="flex items-center gap-3 rounded-xl border border-violet-100 bg-white p-3">
                  <span
                    className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-2xl shrink-0"
                    aria-hidden
                  >
                    {emojiPreview}
                  </span>
                  <p className="text-xs font-medium text-gray-600 leading-relaxed">
                    İsimden otomatik ikon kullanılır (emoji). Ayrı bir ikon dosyası yüklenmez.
                  </p>
                </div>
              )}

              {values.card_visual_type === "image" && (
                <div className="space-y-3">
                  {imagePickError && (
                    <p className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                      {imagePickError}
                    </p>
                  )}
                  {previewSrc ? (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-violet-100 bg-white p-3">
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={previewSrc}
                          alt="Menü kartı önizleme"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2 min-w-0">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center justify-center min-h-11 gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-[10px] font-black uppercase text-violet-800 hover:bg-violet-100 disabled:opacity-50"
                        >
                          <ImageIcon size={14} aria-hidden />
                          Değiştir
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            set({
                              card_image_file: null,
                              remove_card_image: true,
                              card_image_url: values.card_image_url,
                            })
                          }
                          className="inline-flex items-center justify-center min-h-11 gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-[10px] font-black uppercase text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 size={14} aria-hidden />
                          Kaldır
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-violet-200 bg-white p-4 space-y-2">
                      <p className="text-xs font-medium text-gray-500">
                        JPG, PNG veya WebP. En fazla 20 MB. Seçtikten sonra kare kırpma ekranı
                        açılır; kayıtta ~400px WebP oluşturulur.
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center justify-center min-h-11 gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-xs font-black text-violet-800 hover:bg-violet-100 disabled:opacity-50"
                      >
                        <ImageIcon size={16} aria-hidden />
                        Görsel seç
                      </button>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={PRODUCT_IMAGE_ACCEPT}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      e.target.value = "";
                      if (!file) return;
                      handleImageFileSelected(file);
                    }}
                  />
                </div>
              )}

              {values.card_visual_type === "none" && (
                <p className="text-xs font-medium text-gray-600 leading-relaxed rounded-xl border border-violet-100 bg-white px-3 py-2.5">
                  Soldaki ikon/görsel alanı gizlenir. Kart yalnızca başlık, alt bilgi ve ok ile
                  gösterilir.
                </p>
              )}
            </div>

            <label className="flex items-center gap-3 min-h-11 p-4 bg-gray-50 rounded-2xl border border-gray-100 cursor-pointer">
              <input
                type="checkbox"
                checked={values.is_active}
                onChange={(e) => set({ is_active: e.target.checked })}
                className="h-5 w-5 rounded border-gray-300"
              />
              <span className="text-sm font-bold text-gray-800">Müşteri menüsünde aktif</span>
            </label>
          </div>
          <div className="shrink-0 border-t border-gray-100 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-5">
            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-11 bg-blue-600 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-5 w-5 animate-spin" />}
              Kaydet
            </button>
          </div>
        </form>
      </div>

      <ImageCropModal
        open={Boolean(cropSession)}
        imageSrc={cropSession?.imageSrc ?? null}
        busy={busy}
        title="Menü kartı görselini kırp"
        onCancel={closeCropSession}
        onConfirm={handleCropConfirm}
      />
    </div>
  );
}
