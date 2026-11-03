import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { buildRestaurantSettingsDbPayload } from "./save-restaurant-settings";

/**
 * DB tetikleyicisi restaurants_guard_owner_update, owner'ın yalnızca belirli sütunları
 * güncellemesine izin verir. Ayarlar kaydına yeni bir alan eklenip tetikleyicideki liste
 * güncellenmezse tüm restoranlarda kayıt bozulur; bu test o kaymayı yakalar.
 */
function loadOwnerEditableColumns(): string[] {
  const dir = path.join(process.cwd(), "supabase", "migrations");
  const sql = readFileSync(path.join(dir, "20261103120000_tenant_security_hardening.sql"), "utf8");
  const match = sql.match(/owner_editable\s+text\[\]\s*:=\s*array\[([\s\S]*?)\];/);
  assert.ok(match, "owner_editable listesi migration içinde bulunamadı");
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

describe("restaurant owner-editable columns", () => {
  it("settings save payload only uses columns the DB guard allows", () => {
    const allowed = new Set(loadOwnerEditableColumns());
    const payload = buildRestaurantSettingsDbPayload({
      settings: {
        primary_color: "#000000",
        slider_images: [],
        instagram: "x",
        logo_display_mode: "logo",
        theme_id: "t",
        font_style_id: "f",
      } as unknown as Parameters<typeof buildRestaurantSettingsDbPayload>[0]["settings"],
      logoUrl: "",
      welcomeBgUrl: "",
    });
    const blocked = Object.keys(payload).filter((key) => !allowed.has(key));
    assert.deepEqual(
      blocked,
      [],
      `Bu alanlar ayarlarda kaydediliyor ama DB tetikleyicisi izin vermiyor: ${blocked.join(", ")}. ` +
        "Yeni bir migration ile restaurants_guard_owner_update listesine ekleyin."
    );
  });
});
