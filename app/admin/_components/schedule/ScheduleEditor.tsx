"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  describeSchedule,
  emptyScheduleDraft,
  type Schedule,
  type ScheduleOutsideMode,
  type ScheduleWindow,
} from "@/lib/public-menu/schedule";

/**
 * Faz 2.3: menü / kategori / ürün için ortak "servis zamanı" düzenleyicisi.
 * value === null  → her zaman (zamanlama yok). Boş taslak (saat/tarih yok) kaydedilirken null olur.
 */

type Props = {
  value: Schedule | null;
  onChange: (next: Schedule | null) => void;
  /** Ne için: "menü", "kategori", "ürün" (metinlerde kullanılır). */
  subject: string;
};

const DAYS: { id: number; label: string }[] = [
  { id: 1, label: "Pzt" },
  { id: 2, label: "Sal" },
  { id: 3, label: "Çar" },
  { id: 4, label: "Per" },
  { id: 5, label: "Cum" },
  { id: 6, label: "Cmt" },
  { id: 0, label: "Paz" },
];

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const PRESETS: { label: string; start: string; end: string }[] = [
  { label: "Kahvaltı 07:00–11:00", start: "07:00", end: "11:00" },
  { label: "Öğle 11:00–16:00", start: "11:00", end: "16:00" },
  { label: "Akşam 17:00–23:00", start: "17:00", end: "23:00" },
];

const inputClass =
  "min-h-11 border-2 border-gray-100 bg-white rounded-xl px-3 py-2 font-bold text-sm text-gray-900 outline-none focus:border-blue-300";

export function ScheduleEditor({ value, onChange, subject }: Props) {
  const enabled = value !== null;
  const draft = value ?? emptyScheduleDraft();

  const patch = (next: Partial<Schedule>) => onChange({ ...draft, ...next });

  const setWindow = (index: number, next: Partial<ScheduleWindow>) => {
    patch({ windows: draft.windows.map((w, i) => (i === index ? { ...w, ...next } : w)) });
  };

  const addWindow = (start: string | null = "11:00", end: string | null = "16:00") => {
    if (draft.windows.length >= 14) return;
    patch({ windows: [...draft.windows, { days: ALL_DAYS, start, end }] });
  };

  const toggleDay = (index: number, day: number) => {
    const w = draft.windows[index];
    const days = w.days.includes(day) ? w.days.filter((d) => d !== day) : [...w.days, day];
    setWindow(index, { days });
  };

  const summary = describeSchedule(
    draft.windows.some((w) => w.days.length > 0) || draft.starts_on || draft.ends_on ? draft : null,
    "tr"
  );

  return (
    <div className="space-y-3 rounded-2xl border-2 border-amber-100 bg-amber-50/40 p-3 md:p-4">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Servis zamanı</p>
        <p className="mt-1 text-xs font-medium leading-relaxed text-amber-900/70">
          Bu {subject} belirli saat/günlerde servis ediliyorsa burada belirtin. Müşteriler servis dışındayken de
          içeriği görebilir (isterseniz gizleyebilirsiniz).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`min-h-11 rounded-xl px-3 py-2 text-xs font-black transition-all ${
            !enabled ? "bg-blue-600 text-white shadow-md" : "bg-white text-gray-500 border-2 border-gray-100"
          }`}
        >
          Her zaman
        </button>
        <button
          type="button"
          onClick={() => (enabled ? undefined : onChange(emptyScheduleDraft()))}
          className={`min-h-11 rounded-xl px-3 py-2 text-xs font-black transition-all ${
            enabled ? "bg-blue-600 text-white shadow-md" : "bg-white text-gray-500 border-2 border-gray-100"
          }`}
        >
          Belirli saat / tarih
        </button>
      </div>

      {enabled && (
        <div className="space-y-4">
          <div className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Hızlı ekle</span>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => addWindow(preset.start, preset.end)}
                  className="min-h-11 rounded-xl bg-white border-2 border-gray-100 px-3 py-2 text-[11px] font-bold text-gray-600 hover:border-blue-200"
                >
                  + {preset.label}
                </button>
              ))}
            </div>
          </div>

          {draft.windows.map((w, index) => {
            const allDay = w.start === null || w.end === null;
            return (
              <div key={index} className="space-y-2 rounded-xl border-2 border-gray-100 bg-white p-3">
                <div className="flex flex-wrap gap-1">
                  {DAYS.map((day) => (
                    <button
                      key={day.id}
                      type="button"
                      onClick={() => toggleDay(index, day.id)}
                      aria-pressed={w.days.includes(day.id)}
                      className={`min-h-11 min-w-11 rounded-lg px-2 text-[11px] font-black transition-all ${
                        w.days.includes(day.id) ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
                    <input
                      type="checkbox"
                      className="h-5 w-5 rounded border-gray-300"
                      checked={allDay}
                      onChange={(e) =>
                        setWindow(index, e.target.checked ? { start: null, end: null } : { start: "11:00", end: "16:00" })
                      }
                    />
                    Tüm gün
                  </label>
                  {!allDay && (
                    <>
                      <input
                        type="time"
                        aria-label="Başlangıç saati"
                        value={w.start ?? ""}
                        onChange={(e) => setWindow(index, { start: e.target.value || null })}
                        className={inputClass}
                      />
                      <span className="text-xs font-bold text-gray-400">–</span>
                      <input
                        type="time"
                        aria-label="Bitiş saati"
                        value={w.end ?? ""}
                        onChange={(e) => setWindow(index, { end: e.target.value || null })}
                        className={inputClass}
                      />
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => patch({ windows: draft.windows.filter((_, i) => i !== index) })}
                    aria-label="Bu aralığı sil"
                    className="ml-auto min-h-11 min-w-11 flex items-center justify-center rounded-xl text-red-500 hover:bg-red-50"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {!allDay && w.start && w.end && w.end < w.start && (
                  <p className="text-[11px] font-bold text-gray-400">
                    Bitiş saati başlangıçtan küçük: gece yarısını aşan aralık olarak uygulanır (ertesi sabaha kadar).
                  </p>
                )}
                {w.days.length === 0 && (
                  <p className="text-[11px] font-bold text-red-500">
                    En az bir gün seçin; günsüz aralık kaydedilmez.
                  </p>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => addWindow()}
            className="min-h-11 flex items-center gap-1.5 rounded-xl bg-white border-2 border-dashed border-gray-200 px-3 py-2 text-xs font-black text-gray-500 hover:border-blue-300"
          >
            <Plus size={14} /> Saat aralığı ekle
          </button>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                Başlangıç tarihi (isteğe bağlı)
              </span>
              <input
                type="date"
                value={draft.starts_on ?? ""}
                onChange={(e) => patch({ starts_on: e.target.value || null })}
                className={`${inputClass} mt-1 w-full`}
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                Bitiş tarihi (isteğe bağlı)
              </span>
              <input
                type="date"
                value={draft.ends_on ?? ""}
                onChange={(e) => patch({ ends_on: e.target.value || null })}
                className={`${inputClass} mt-1 w-full`}
              />
            </label>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-[10px] font-black uppercase tracking-widest text-gray-400">
              Servis dışındayken müşteri ne görsün?
            </legend>
            {(
              [
                ["show", "İçeriği göster", "Soluk görünür, “Şu an servis dışı” notu çıkar."],
                ["hide", "Gizle", `Bu ${subject} servis dışında müşteriye hiç görünmez.`],
              ] as [ScheduleOutsideMode, string, string][]
            ).map(([mode, title, hint]) => (
              <label
                key={mode}
                className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border-2 p-3 ${
                  draft.outside === mode ? "border-blue-300 bg-blue-50/50" : "border-gray-100 bg-white"
                }`}
              >
                <input
                  type="radio"
                  name={`schedule-outside-${subject}`}
                  className="mt-0.5 h-5 w-5"
                  checked={draft.outside === mode}
                  onChange={() => patch({ outside: mode })}
                />
                <span className="text-xs font-black text-gray-800">
                  {title}
                  <span className="block text-[11px] font-bold text-gray-400">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <p className="text-xs font-bold text-gray-500">
            {summary ? `Özet: ${summary}` : "Kaydetmek için en az bir saat aralığı ya da tarih girin; aksi halde “Her zaman” olarak kalır."}
          </p>
        </div>
      )}
    </div>
  );
}
