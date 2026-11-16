"use client";

import { useEffect, useRef } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Meşgulken düğmede görünen yazı (varsayılan silme işlemleri için "Siliniyor…"). */
  busyLabel?: string;
  /** danger = silme (kırmızı, varsayılan); primary = zararsız onay (mavi). */
  tone?: "danger" | "primary";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * window.confirm yerine: tarayıcı onay penceresi sayfayı dondurur (INP ölçümünde ~1 sn görünür)
 * ve temayla uyumsuzdur. Varsayılan odak "Vazgeç"te; Esc veya dışarı tıklama iptal eder.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Sil",
  cancelLabel = "Vazgeç",
  busyLabel = "Siliniyor…",
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Çağıranların satır içi onCancel fonksiyonu her render'da yenilenir; efekt onu bağımlılık almazsa
  // odak yalnızca pencere açılırken "Vazgeç"e verilir (busy değişince sıçramaz).
  const onCancelRef = useRef(onCancel);
  const busyRef = useRef(busy);
  // Ref'ler render sırasında değil efektte güncellenir (react-hooks/refs kuralı).
  useEffect(() => {
    onCancelRef.current = onCancel;
    busyRef.current = busy;
  });

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busyRef.current) onCancelRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Kapat"
        tabIndex={-1}
        onClick={() => !busy && onCancel()}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6"
      >
        <h3 id="confirm-dialog-title" className="text-lg font-black text-gray-900 break-words">
          {title}
        </h3>
        <p id="confirm-dialog-message" className="mt-2 text-sm text-gray-600 whitespace-pre-line">
          {message}
        </p>
        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-5 py-3 rounded-2xl font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`px-5 py-3 rounded-2xl font-bold text-white transition-colors disabled:opacity-50 ${
              tone === "primary" ? "bg-blue-600 hover:bg-blue-700" : "bg-red-600 hover:bg-red-700"
            }`}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
