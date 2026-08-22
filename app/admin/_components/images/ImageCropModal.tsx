"use client";

import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Loader2, X } from "lucide-react";
import "react-easy-crop/react-easy-crop.css";
import {
  IMAGE_CROP_FAILED_MESSAGE,
  getCroppedImageBlob,
} from "@/lib/images/crop-image";

type ImageCropModalProps = {
  open: boolean;
  imageSrc: string | null;
  busy?: boolean;
  error?: string | null;
  title?: string;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void | Promise<void>;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

export function ImageCropModal({
  open,
  imageSrc,
  busy = false,
  error = null,
  title = "Görseli kırp",
  onCancel,
  onConfirm,
}: ImageCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setLocalError(null);
    setConfirming(false);
  }, [open, imageSrc]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy && !confirming) {
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, confirming, onCancel]);

  const handleConfirm = useCallback(async () => {
    if (!imageSrc || !croppedAreaPixels || busy || confirming) return;
    setLocalError(null);
    setConfirming(true);
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels);
      await onConfirm(blob);
    } catch (e) {
      setLocalError(
        e instanceof Error && e.message === IMAGE_CROP_FAILED_MESSAGE
          ? e.message
          : IMAGE_CROP_FAILED_MESSAGE
      );
    } finally {
      setConfirming(false);
    }
  }, [imageSrc, croppedAreaPixels, busy, confirming, onConfirm]);

  if (!open || !imageSrc) return null;

  const displayError = error || localError;
  const disabled = busy || confirming;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-gray-950 text-white overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-crop-title"
    >
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 md:px-6 border-b border-white/10 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h2 id="image-crop-title" className="text-base md:text-lg font-black min-w-0 truncate">
          {title}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="inline-flex items-center justify-center min-h-11 min-w-11 rounded-xl text-white/70 hover:bg-white/10 disabled:opacity-40"
          aria-label="Kapat"
        >
          <X size={22} />
        </button>
      </div>

      <div className="relative flex-1 min-h-0 bg-black">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="rect"
          showGrid
          objectFit="contain"
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_area, areaPixels) => setCroppedAreaPixels(areaPixels)}
          classes={{
            containerClassName: "bg-black",
            cropAreaClassName: "border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]",
          }}
        />
      </div>

      <div className="shrink-0 border-t border-white/10 bg-gray-950 px-4 md:px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-white/70">
            <span>Yakınlaştır</span>
            <span>{Math.round(zoom * 100)}%</span>
          </div>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={disabled}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-violet-400"
            aria-label="Yakınlaştır"
          />
        </div>

        {displayError && (
          <p className="text-sm font-bold text-red-300 bg-red-950/40 border border-red-400/30 rounded-xl px-3 py-2">
            {displayError}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled}
            className="flex-1 min-h-11 rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-black text-white hover:bg-white/10 disabled:opacity-40"
          >
            İptal
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={disabled || !croppedAreaPixels}
            className="flex-1 min-h-11 rounded-xl bg-violet-600 px-4 py-3 text-sm font-black text-white hover:bg-violet-500 disabled:opacity-40 inline-flex items-center justify-center gap-2"
          >
            {(busy || confirming) && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Kullan
          </button>
        </div>
      </div>
    </div>
  );
}
