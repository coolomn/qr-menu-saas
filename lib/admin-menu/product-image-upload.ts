"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildLogoImageObjectPath,
  buildMenuCollectionCardImageObjectPath,
  buildProductImageObjectPaths,
  buildSliderImageObjectPath,
  buildWelcomeBackgroundObjectPath,
  prepareLogoImage,
  prepareMenuCollectionCardImage,
  prepareProductFullImage,
  prepareProductThumbnail,
  prepareSliderImage,
  prepareWelcomeBackgroundImage,
} from "@/lib/images/prepare-presets";
import {
  publicBackgroundStoragePathFromUrl,
  publicLogoStoragePathFromUrl,
  publicMenuCollectionCardStoragePathFromUrl,
  publicProductStoragePathFromUrl,
  publicSliderStoragePathFromUrl,
} from "@/lib/public-menu/product-image-urls";

export const MENU_PUBLIC_BUCKET = "menu-public";

export const PRODUCT_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

export const PRODUCT_IMAGE_CACHE_CONTROL = "31536000";

export type PublicAssetKind =
  | "logo"
  | "background"
  | "slider"
  | "products"
  | "menu-collections";

export type ProductImageUploadResult = {
  url: string;
  thumbnailUrl: string;
};

function sanitizeFileExtension(raw: string | undefined, fallback = "jpg"): string {
  const ext = (raw || fallback).toLowerCase().replace(/[^a-z0-9]/g, "");
  return ext || fallback;
}

function newAssetUniqueId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function buildPublicAssetPath(
  restaurantId: string,
  kind: PublicAssetKind,
  ext: string
): string {
  return `restaurants/${restaurantId}/${kind}/${newAssetUniqueId()}.${sanitizeFileExtension(ext)}`;
}

function publicUrlForPath(supabase: SupabaseClient, path: string): string {
  return supabase.storage.from(MENU_PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function removeStoragePath(supabase: SupabaseClient, path: string): Promise<void> {
  const { error } = await supabase.storage.from(MENU_PUBLIC_BUCKET).remove([path]);
  if (error) {
    console.warn("[product-image] storage remove skipped:", path, error.message);
  }
}

/** Best-effort: yalnızca bu restoranın products/ dosyalarını siler. */
export async function tryRemoveProductImageFiles(
  supabase: SupabaseClient,
  restaurantId: string,
  urls: Array<string | null | undefined>
): Promise<void> {
  const paths: string[] = [];
  for (const url of urls) {
    if (!url?.trim()) continue;
    const path = publicProductStoragePathFromUrl(url, restaurantId);
    if (path && !paths.includes(path)) paths.push(path);
  }
  for (const path of paths) {
    await removeStoragePath(supabase, path);
  }
}

/** Best-effort: yalnızca this restoranın background/ dosyalarını siler. */
export async function tryRemoveBackgroundImageFiles(
  supabase: SupabaseClient,
  restaurantId: string,
  urls: Array<string | null | undefined>
): Promise<void> {
  const paths: string[] = [];
  for (const url of urls) {
    if (!url?.trim()) continue;
    const path = publicBackgroundStoragePathFromUrl(url, restaurantId);
    if (path && !paths.includes(path)) paths.push(path);
  }
  for (const path of paths) {
    await removeStoragePath(supabase, path);
  }
}

/** Best-effort: yalnızca bu restoranın slider/ dosyalarını siler. */
export async function tryRemoveSliderImageFiles(
  supabase: SupabaseClient,
  restaurantId: string,
  urls: Array<string | null | undefined>
): Promise<void> {
  const paths: string[] = [];
  for (const url of urls) {
    if (!url?.trim()) continue;
    const path = publicSliderStoragePathFromUrl(url, restaurantId);
    if (path && !paths.includes(path)) paths.push(path);
  }
  for (const path of paths) {
    await removeStoragePath(supabase, path);
  }
}

/** Best-effort: yalnızca bu restoranın logo/ dosyalarını siler. */
export async function tryRemoveLogoImageFiles(
  supabase: SupabaseClient,
  restaurantId: string,
  urls: Array<string | null | undefined>
): Promise<void> {
  const paths: string[] = [];
  for (const url of urls) {
    if (!url?.trim()) continue;
    const path = publicLogoStoragePathFromUrl(url, restaurantId);
    if (path && !paths.includes(path)) paths.push(path);
  }
  for (const path of paths) {
    await removeStoragePath(supabase, path);
  }
}

/** Best-effort: yalnızca bu restoranın menu-collections/ dosyalarını siler. */
export async function tryRemoveMenuCollectionCardImageFiles(
  supabase: SupabaseClient,
  restaurantId: string,
  urls: Array<string | null | undefined>
): Promise<void> {
  const paths: string[] = [];
  for (const url of urls) {
    if (!url?.trim()) continue;
    const path = publicMenuCollectionCardStoragePathFromUrl(url, restaurantId);
    if (path && !paths.includes(path)) paths.push(path);
  }
  for (const path of paths) {
    await removeStoragePath(supabase, path);
  }
}

export async function uploadMenuCollectionCardImage(
  supabase: SupabaseClient,
  restaurantId: string,
  file: File
): Promise<{ url: string } | { error: string }> {
  try {
    const prepared = await prepareMenuCollectionCardImage(file);
    const path = buildMenuCollectionCardImageObjectPath(
      restaurantId,
      newAssetUniqueId(),
      prepared.ext
    );
    const { error } = await supabase.storage.from(MENU_PUBLIC_BUCKET).upload(path, prepared.blob, {
      contentType: prepared.contentType,
      cacheControl: PRODUCT_IMAGE_CACHE_CONTROL,
      upsert: false,
    });
    if (error) {
      return { error: error.message || "Görsel yüklenemedi." };
    }
    return { url: publicUrlForPath(supabase, path) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Görsel yüklenemedi." };
  }
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
  return { url: publicUrlForPath(supabase, path) };
}

export async function uploadProductImage(
  supabase: SupabaseClient,
  restaurantId: string,
  file: File
): Promise<ProductImageUploadResult | { error: string }> {
  try {
    const full = await prepareProductFullImage(file);
    const unique = newAssetUniqueId();
    let thumbExt = "webp";
    let thumbBlob: Blob | null = null;
    let thumbType: string = "image/webp";

    try {
      const thumb = await prepareProductThumbnail(full.blob);
      thumbExt = thumb.ext;
      thumbBlob = thumb.blob;
      thumbType = thumb.contentType;
    } catch (thumbErr) {
      console.warn("[product-image] thumbnail create failed:", thumbErr);
    }

    const paths = buildProductImageObjectPaths(restaurantId, unique, full.ext, thumbExt);

    const { error: originalError } = await supabase.storage
      .from(MENU_PUBLIC_BUCKET)
      .upload(paths.original, full.blob, {
        contentType: full.contentType,
        cacheControl: PRODUCT_IMAGE_CACHE_CONTROL,
        upsert: false,
      });
    if (originalError) {
      return { error: originalError.message || "Görsel yüklenemedi." };
    }

    const url = publicUrlForPath(supabase, paths.original);
    let thumbnailUrl = "";

    if (thumbBlob) {
      const { error: thumbError } = await supabase.storage
        .from(MENU_PUBLIC_BUCKET)
        .upload(paths.thumbnail, thumbBlob, {
          contentType: thumbType,
          cacheControl: PRODUCT_IMAGE_CACHE_CONTROL,
          upsert: false,
        });
      if (thumbError) {
        console.warn("[product-image] thumbnail upload failed:", thumbError.message);
      } else {
        thumbnailUrl = publicUrlForPath(supabase, paths.thumbnail);
      }
    }

    return { url, thumbnailUrl };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Görsel yüklenemedi." };
  }
}

export async function uploadWelcomeBackgroundImage(
  supabase: SupabaseClient,
  restaurantId: string,
  file: File
): Promise<{ url: string } | { error: string }> {
  try {
    const prepared = await prepareWelcomeBackgroundImage(file);
    const path = buildWelcomeBackgroundObjectPath(
      restaurantId,
      newAssetUniqueId(),
      prepared.ext
    );
    const { error } = await supabase.storage.from(MENU_PUBLIC_BUCKET).upload(path, prepared.blob, {
      contentType: prepared.contentType,
      cacheControl: PRODUCT_IMAGE_CACHE_CONTROL,
      upsert: false,
    });
    if (error) {
      return { error: error.message || "Görsel yüklenemedi." };
    }
    return { url: publicUrlForPath(supabase, path) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Görsel yüklenemedi." };
  }
}

export async function uploadSliderImage(
  supabase: SupabaseClient,
  restaurantId: string,
  file: File
): Promise<{ url: string } | { error: string }> {
  try {
    const prepared = await prepareSliderImage(file);
    const path = buildSliderImageObjectPath(restaurantId, newAssetUniqueId(), prepared.ext);
    const { error } = await supabase.storage.from(MENU_PUBLIC_BUCKET).upload(path, prepared.blob, {
      contentType: prepared.contentType,
      cacheControl: PRODUCT_IMAGE_CACHE_CONTROL,
      upsert: false,
    });
    if (error) {
      return { error: error.message || "Görsel yüklenemedi." };
    }
    return { url: publicUrlForPath(supabase, path) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Görsel yüklenemedi." };
  }
}

export async function uploadLogoImage(
  supabase: SupabaseClient,
  restaurantId: string,
  file: File
): Promise<{ url: string } | { error: string }> {
  try {
    const prepared = await prepareLogoImage(file);
    const path = buildLogoImageObjectPath(restaurantId, newAssetUniqueId(), prepared.ext);
    const { error } = await supabase.storage.from(MENU_PUBLIC_BUCKET).upload(path, prepared.blob, {
      contentType: prepared.contentType,
      cacheControl: PRODUCT_IMAGE_CACHE_CONTROL,
      upsert: false,
    });
    if (error) {
      return { error: error.message || "Görsel yüklenemedi." };
    }
    return { url: publicUrlForPath(supabase, path) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Görsel yüklenemedi." };
  }
}
