"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { prepareProductImageForUpload } from "@/lib/prepare-product-image-client";

export const MENU_PUBLIC_BUCKET = "menu-public";

export const PRODUCT_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

export type PublicAssetKind = "logo" | "background" | "slider" | "products";

function sanitizeFileExtension(raw: string | undefined, fallback = "jpg"): string {
  const ext = (raw || fallback).toLowerCase().replace(/[^a-z0-9]/g, "");
  return ext || fallback;
}

export function buildPublicAssetPath(
  restaurantId: string,
  kind: PublicAssetKind,
  ext: string
): string {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return `restaurants/${restaurantId}/${kind}/${unique}.${sanitizeFileExtension(ext)}`;
}

export async function uploadPublicAsset(
  supabase: SupabaseClient,
  restaurantId: string,
  kind: PublicAssetKind,
  file: File | Blob,
  options?: { ext?: string; contentType?: string }
): Promise<{ url: string } | { error: string }> {
  const ext =
    options?.ext ??
    (file instanceof File && file.name.includes(".") ? file.name.split(".").pop() : "jpg");
  const path = buildPublicAssetPath(restaurantId, kind, ext ?? "jpg");
  const { error } = await supabase.storage.from(MENU_PUBLIC_BUCKET).upload(path, file, {
    contentType: options?.contentType ?? (file instanceof File ? file.type || undefined : undefined),
    upsert: false,
  });
  if (error) {
    return { error: error.message || "Görsel yüklenemedi." };
  }
  const url = supabase.storage.from(MENU_PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl;
  return { url };
}

export async function uploadProductImage(
  supabase: SupabaseClient,
  restaurantId: string,
  file: File
): Promise<{ url: string } | { error: string }> {
  try {
    const prep = await prepareProductImageForUpload(file);
    const ext =
      prep.blob === file && file.name.includes(".")
        ? sanitizeFileExtension(file.name.split(".").pop())
        : "jpg";
    return uploadPublicAsset(supabase, restaurantId, "products", prep.blob, {
      ext,
      contentType: prep.contentType,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Görsel yüklenemedi." };
  }
}
