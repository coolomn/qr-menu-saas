import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRestaurantSettingsCleanup,
  buildRestaurantSettingsDbPayload,
  formatRestaurantSettingsNetworkDetail,
  formatRestaurantSettingsSaveError,
  normalizeSavedRestaurantSettings,
  RestaurantSettingsSaveError,
} from "./save-restaurant-settings";

describe("buildRestaurantSettingsDbPayload", () => {
  it("maps trimmed instagram to null when empty", () => {
    const payload = buildRestaurantSettingsDbPayload({
      settings: {
        logo_url: "https://cdn/logo.webp",
        primary_color: "#111111",
        slider_images: ["https://cdn/s1.webp"],
        welcome_bg_url: "https://cdn/bg.webp",
        instagram: "  ",
        logo_display_mode: "auto",
        theme_id: "classic",
        font_style_id: "modern",
      },
      logoUrl: "https://cdn/logo.webp",
      welcomeBgUrl: "https://cdn/bg.webp",
    });

    assert.equal(payload.instagram, null);
    assert.equal(payload.font_style_id, "modern");
    assert.equal(payload.primary_color, "#111111");
  });
});

describe("buildRestaurantSettingsCleanup", () => {
  it("does not schedule cleanup when no asset files changed", () => {
    const cleanup = buildRestaurantSettingsCleanup({
      logoFile: null,
      welcomeBgFile: null,
      previousLogoUrl: "https://cdn/old-logo.webp",
      previousWelcomeBgUrl: "https://cdn/old-bg.webp",
      previousSliderImages: ["https://cdn/s1.webp", "https://cdn/s2.webp"],
      finalLogoUrl: "https://cdn/old-logo.webp",
      finalWelcomeBgUrl: "https://cdn/old-bg.webp",
      finalSliderImages: ["https://cdn/s1.webp"],
    });

    assert.equal(cleanup.removedLogoUrl, null);
    assert.equal(cleanup.removedWelcomeBgUrl, null);
    assert.deepEqual(cleanup.removedSliderUrls, ["https://cdn/s2.webp"]);
  });

  it("schedules logo cleanup only after a new logo upload", () => {
    const cleanup = buildRestaurantSettingsCleanup({
      logoFile: {} as File,
      welcomeBgFile: null,
      previousLogoUrl: "https://cdn/old-logo.webp",
      previousWelcomeBgUrl: "",
      previousSliderImages: [],
      finalLogoUrl: "https://cdn/new-logo.webp",
      finalWelcomeBgUrl: "",
      finalSliderImages: [],
    });

    assert.equal(cleanup.removedLogoUrl, "https://cdn/old-logo.webp");
  });
});

describe("formatRestaurantSettingsSaveError", () => {
  it("maps Safari network failures to Turkish guidance", () => {
    assert.equal(
      formatRestaurantSettingsNetworkDetail("Load failed"),
      "ağ bağlantısı kesildi veya istek zaman aşımına uğradı"
    );
    assert.equal(
      formatRestaurantSettingsSaveError(
        new RestaurantSettingsSaveError("Ayarlar kaydedilemedi", "Load failed")
      ),
      "Ayarlar kaydedilemedi: ağ bağlantısı kesildi veya istek zaman aşımına uğradı"
    );
  });
});

describe("normalizeSavedRestaurantSettings", () => {
  it("normalizes theme and font ids from payload", () => {
    const saved = normalizeSavedRestaurantSettings(
      {
        logo_url: "https://cdn/logo.webp",
        primary_color: "#2563eb",
        slider_images: [],
        welcome_bg_url: "",
        instagram: "@demo",
        logo_display_mode: "auto",
        theme_id: "classic",
        font_style_id: "premium",
      },
      "https://cdn/logo.webp",
      ""
    );

    assert.equal(saved.font_style_id, "premium");
    assert.equal(saved.theme_id, "classic");
    assert.equal(saved.instagram, "@demo");
  });
});
