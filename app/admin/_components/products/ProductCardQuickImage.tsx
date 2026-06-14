"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Trash2, UtensilsCrossed } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import {
  PRODUCT_IMAGE_ACCEPT,
  uploadProductImage,
} from "@/lib/admin-menu/product-image-upload";

const supabase = getBrowserSupabase();

type ProductCardQuickImageProps = {
  productId: string;
  imageUrl: string | null | undefined;
  restaurantId: string;
  disabled?: boolean;
  onImageUpdated: (productId: string, imageUrl: string) => void;
};

export function ProductCardQuickImage({
  productId,
  imageUrl,
  restaurantId,
  disabled = false,
  onImageUpdated,
}: ProductCardQuickImageProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const hasImage = Boolean(imageUrl?.trim());
  const isDisabled = disabled || uploading;

  useEffect(() => {
    if (!menuOpen) return;
    const onDocumentMouseDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, [menuOpen]);

  const processFile = async (file: File) => {
    setMenuOpen(false);
    setUploading(true);
    try {
      const upload = await uploadProductImage(supabase, restaurantId, file);
      if ("error" in upload) {
        alert(upload.error);
        return;
      }
      const { error } = await supabase
        .from("products")
        .update({ image_url: upload.url })
        .eq("id", productId);
      if (error) {
        alert(error.message || "Görsel kaydedilemedi.");
        return;
      }
      onImageUpdated(productId, upload.url);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleThumbnailClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (isDisabled) return;
    if (!hasImage) {
      fileInputRef.current?.click();
      return;
    }
    setMenuOpen((open) => !open);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void processFile(file);
    }
  };

  const handleChangeClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    setMenuOpen(false);
    fileInputRef.current?.click();
  };

  const handleDeleteClick = async (event: React.MouseEvent) => {
    event.stopPropagation();
    setMenuOpen(false);
    if (!window.confirm("Ürün fotoğrafı kaldırılsın mı?")) {
      return;
    }
    setUploading(true);
    try {
      const { error } = await supabase
        .from("products")
        .update({ image_url: "" })
        .eq("id", productId);
      if (error) {
        alert(error.message || "Görsel kaldırılamadı.");
        return;
      }
      onImageUpdated(productId, "");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div ref={rootRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={handleThumbnailClick}
        disabled={isDisabled}
        className="relative w-12 h-12 md:w-14 md:h-14 bg-gray-100 rounded-xl overflow-hidden border flex-shrink-0 flex items-center justify-center hover:ring-2 hover:ring-blue-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60 disabled:pointer-events-none transition-shadow"
        aria-label={hasImage ? "Ürün fotoğrafı seçenekleri" : "Ürün fotoğrafı yükle"}
        title={hasImage ? "Fotoğrafı değiştir veya sil" : "Fotoğraf yükle"}
      >
        {uploading ? (
          <Loader2 className="h-6 w-6 text-blue-600 animate-spin" aria-hidden />
        ) : hasImage ? (
          <img src={imageUrl!} alt="" className="w-full h-full object-cover" />
        ) : (
          <UtensilsCrossed className="text-gray-300 h-6 w-6" aria-hidden />
        )}
      </button>

      {menuOpen && hasImage && !uploading && (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-1 min-w-[10.5rem] rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleChangeClick}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-bold text-gray-800 hover:bg-gray-50"
          >
            <RefreshCw size={14} className="shrink-0 text-blue-600" aria-hidden />
            Fotoğrafı Değiştir
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handleDeleteClick}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-bold text-red-700 hover:bg-red-50"
          >
            <Trash2 size={14} className="shrink-0" aria-hidden />
            Fotoğrafı Sil
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={PRODUCT_IMAGE_ACCEPT}
        className="hidden"
        onChange={handleFileChange}
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}
