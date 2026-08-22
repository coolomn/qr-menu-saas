"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  tryRemoveBackgroundImageFiles,
  tryRemoveLogoImageFiles,
  tryRemoveSliderImageFiles,
  uploadLogoImage,
  uploadWelcomeBackgroundImage,
} from "@/lib/admin-menu/product-image-upload";
import type { LogoDisplayMode } from "@/lib/public-menu/logo-display";
import { normalizeLogoDisplayMode } from "@/lib/public-menu/logo-display";
import type { FontStyleId } from "@/lib/public-menu/themes/font-ids";
import { normalizeFontStyleId } from "@/lib/public-menu/themes/font-normalize";
import type { ThemeId } from "@/lib/public-menu/themes/ids";
import { normalizeThemeId } from "@/lib/public-menu/themes/normalize";

export type RestaurantSettingsFormState = {
  logo_url: string;
  primary_color: string;
  slider_images: string[];
  welcome_bg_url: string;
  instagram: string;
  logo_display_mode: LogoDisplayMode;
  theme_id: ThemeId;
  font_style_id: FontStyleId;
};

export type SaveRestaurantSettingsInput = {
  supabase: SupabaseClient;
  restaurantId: string;
  settings: RestaurantSettingsFormState;
  logoFile: File | null;
  welcomeBgFile: File | null;
  previousLogoUrl: string;
  previousWelcomeBgUrl: string;
  previousSliderImages: string[];
};

export type SaveRestaurantSettingsResult = {
  savedSettings: RestaurantSettingsFormState;
  cleanup: {
    removedLogoUrl: string | null;
    removedWelcomeBgUrl: string | null;
    removedSliderUrls: string[];
  };
};

export class RestaurantSettingsSaveError extends Error {
  readonly step: string;

  constructor(step: string, detail: string) {
    super(`${step}: ${formatRestaurantSettingsNetworkDetail(detail)}`);
    this.name = "RestaurantSettingsSaveError";
    this.step = step;
  }
}

function isNetworkFailureMessage(message: string): boolean {
  const lower = message.trim().toLowerCase();
  return (
    lower === "load failed" ||
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("the internet connection appears to be offline")
  );
}

export function formatRestaurantSettingsNetworkDetail(detail: string): string {
  if (isNetworkFailureMessage(detail)) {
    return "ağ bağlantısı kesildi veya istek zaman aşımına uğradı";
  }
  return detail.trim() || "bilinmeyen hata";
}

export function formatRestaurantSettingsSaveError(error: unknown): string {
  if (error instanceof RestaurantSettingsSaveError) {
    return error.message;
  }
  if (error instanceof Error) {
    return `Ayarlar kaydedilemedi: ${formatRestaurantSettingsNetworkDetail(error.message)}`;
  }
  return "Ayarlar kaydedilemedi: bilinmeyen hata.";
}

function logSaveTiming(label: string, ms: number): void {
  if (process.env.NODE_ENV !== "development") return;
  console.debug(`${label}: ${Math.round(ms)} ms`);
}

export function buildRestaurantSettingsDbPayload(input: {
  settings: RestaurantSettingsFormState;
  logoUrl: string;
  welcomeBgUrl: string;
}) {
  const instagram = input.settings.instagram.trim();
  return {
    primary_color: input.settings.primary_color,
    logo_url: input.logoUrl,
    slider_images: input.settings.slider_images,
    welcome_bg_url: input.welcomeBgUrl,
    instagram: instagram || null,
    logo_display_mode: input.settings.logo_display_mode,
    theme_id: input.settings.theme_id,
    font_style_id: input.settings.font_style_id,
  };
}

export function buildRestaurantSettingsCleanup(input: {
  logoFile: File | null;
  welcomeBgFile: File | null;
  previousLogoUrl: string;
  previousWelcomeBgUrl: string;
  previousSliderImages: string[];
  finalLogoUrl: string;
  finalWelcomeBgUrl: string;
  finalSliderImages: string[];
}): SaveRestaurantSettingsResult["cleanup"] {
  const removedLogoUrl =
    input.logoFile &&
    input.previousLogoUrl &&
    input.previousLogoUrl !== input.finalLogoUrl
      ? input.previousLogoUrl
      : null;
  const removedWelcomeBgUrl =
    input.welcomeBgFile &&
    input.previousWelcomeBgUrl &&
    input.previousWelcomeBgUrl !== input.finalWelcomeBgUrl
      ? input.previousWelcomeBgUrl
      : null;
  const removedSliderUrls = input.previousSliderImages.filter(
    (url) => !input.finalSliderImages.includes(url)
  );
  return { removedLogoUrl, removedWelcomeBgUrl, removedSliderUrls };
}

export function normalizeSavedRestaurantSettings(
  settings: RestaurantSettingsFormState,
  logoUrl: string,
  welcomeBgUrl: string
): RestaurantSettingsFormState {
  const instagram =
    settings.instagram.trim() !== "" ? settings.instagram.trim() : "";
  return {
    ...settings,
    logo_url: logoUrl,
    welcome_bg_url: welcomeBgUrl,
    instagram,
    logo_display_mode: normalizeLogoDisplayMode(settings.logo_display_mode),
    theme_id: normalizeThemeId(settings.theme_id),
    font_style_id: normalizeFontStyleId(settings.font_style_id),
  };
}

export async function saveRestaurantSettings(
  input: SaveRestaurantSettingsInput
): Promise<SaveRestaurantSettingsResult> {
  const totalStartedAt = performance.now();
  let finalLogoUrl = input.settings.logo_url;
  let finalWelcomeBgUrl = input.settings.welcome_bg_url;

  const assetStartedAt = performance.now();
  const uploadTasks: Array<Promise<void>> = [];

  if (input.logoFile) {
    uploadTasks.push(
      (async () => {
        try {
          const logoUpload = await uploadLogoImage(
            input.supabase,
            input.restaurantId,
            input.logoFile as File
          );
          if ("error" in logoUpload) {
            throw new RestaurantSettingsSaveError(
              "Logo yüklenemedi",
              formatRestaurantSettingsNetworkDetail(logoUpload.error)
            );
          }
          finalLogoUrl = logoUpload.url;
        } catch (error) {
          if (error instanceof RestaurantSettingsSaveError) throw error;
          const detail =
            error instanceof Error
              ? formatRestaurantSettingsNetworkDetail(error.message)
              : "bilinmeyen hata";
          throw new RestaurantSettingsSaveError("Logo yüklenemedi", detail);
        }
      })()
    );
  }

  if (input.welcomeBgFile) {
    uploadTasks.push(
      (async () => {
        try {
          const bgUpload = await uploadWelcomeBackgroundImage(
            input.supabase,
            input.restaurantId,
            input.welcomeBgFile as File
          );
          if ("error" in bgUpload) {
            throw new RestaurantSettingsSaveError(
              "Karşılama arka planı yüklenemedi",
              formatRestaurantSettingsNetworkDetail(bgUpload.error)
            );
          }
          finalWelcomeBgUrl = bgUpload.url;
        } catch (error) {
          if (error instanceof RestaurantSettingsSaveError) throw error;
          const detail =
            error instanceof Error
              ? formatRestaurantSettingsNetworkDetail(error.message)
              : "bilinmeyen hata";
          throw new RestaurantSettingsSaveError(
            "Karşılama arka planı yüklenemedi",
            detail
          );
        }
      })()
    );
  }

  if (uploadTasks.length > 0) {
    await Promise.all(uploadTasks);
    logSaveTiming("SAVE asset uploads", performance.now() - assetStartedAt);
  }

  const payload = buildRestaurantSettingsDbPayload({
    settings: input.settings,
    logoUrl: finalLogoUrl,
    welcomeBgUrl: finalWelcomeBgUrl,
  });

  const dbStartedAt = performance.now();
  try {
    const { error: dbError } = await input.supabase
      .from("restaurants")
      .update(payload)
      .eq("id", input.restaurantId);

    if (dbError) {
      const hint = [dbError.message, (dbError as { details?: string }).details]
        .filter(Boolean)
        .join(" — ");
      throw new RestaurantSettingsSaveError(
        "Ayarlar kaydedilemedi",
        hint || "veritabanı hatası"
      );
    }
  } catch (error) {
    if (error instanceof RestaurantSettingsSaveError) throw error;
    const detail =
      error instanceof Error
        ? formatRestaurantSettingsNetworkDetail(error.message)
        : "bilinmeyen hata";
    throw new RestaurantSettingsSaveError("Ayarlar kaydedilemedi", detail);
  }
  logSaveTiming("SAVE restaurant update", performance.now() - dbStartedAt);
  logSaveTiming("SAVE total", performance.now() - totalStartedAt);

  const finalSliderImages = input.settings.slider_images;
  const cleanup = buildRestaurantSettingsCleanup({
    logoFile: input.logoFile,
    welcomeBgFile: input.welcomeBgFile,
    previousLogoUrl: input.previousLogoUrl,
    previousWelcomeBgUrl: input.previousWelcomeBgUrl,
    previousSliderImages: input.previousSliderImages,
    finalLogoUrl,
    finalWelcomeBgUrl,
    finalSliderImages,
  });

  return {
    savedSettings: normalizeSavedRestaurantSettings(
      input.settings,
      finalLogoUrl,
      finalWelcomeBgUrl
    ),
    cleanup,
  };
}

export async function runRestaurantSettingsAssetCleanup(
  supabase: SupabaseClient,
  restaurantId: string,
  cleanup: SaveRestaurantSettingsResult["cleanup"]
): Promise<void> {
  const cleanupStartedAt = performance.now();
  const tasks: Array<Promise<void>> = [];

  if (cleanup.removedLogoUrl) {
    tasks.push(
      tryRemoveLogoImageFiles(supabase, restaurantId, [cleanup.removedLogoUrl])
    );
  }
  if (cleanup.removedWelcomeBgUrl) {
    tasks.push(
      tryRemoveBackgroundImageFiles(supabase, restaurantId, [
        cleanup.removedWelcomeBgUrl,
      ])
    );
  }
  if (cleanup.removedSliderUrls.length > 0) {
    tasks.push(
      tryRemoveSliderImageFiles(supabase, restaurantId, cleanup.removedSliderUrls)
    );
  }

  if (tasks.length > 0) {
    await Promise.all(tasks);
    logSaveTiming("SAVE asset cleanup", performance.now() - cleanupStartedAt);
  }
}
