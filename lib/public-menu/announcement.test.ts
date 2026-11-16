import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { aiTranslateRequestSchema } from "@/lib/i18n/ai-translate-request";
import {
  ANNOUNCEMENT_MAX_LENGTH,
  announcementDismissKey,
  announcementForSave,
  emptyAnnouncement,
  isAnnouncementLive,
  parseAnnouncement,
  publicAnnouncement,
  resolveAnnouncementText,
  validateAnnouncement,
} from "./announcement";

const base = {
  enabled: true,
  text: "Cuma akşamı canlı müzik!",
  translations: { en: { text: "Live music on Friday night!" } },
  starts_on: null,
  ends_on: null,
};

describe("parseAnnouncement", () => {
  it("returns an empty, disabled announcement for missing/invalid values", () => {
    for (const raw of [null, undefined, "x", 5, [], {}]) {
      assert.deepEqual(parseAnnouncement(raw), emptyAnnouncement());
    }
  });

  it("keeps valid fields, collapses whitespace and drops junk", () => {
    const parsed = parseAnnouncement({
      enabled: true,
      text: "  Merhaba \n  dünya  ",
      translations: { en: { text: " Hello  world " }, xx: { text: "nope" }, de: { text: 5 } },
      starts_on: "2026-12-01",
      ends_on: "2026-02-30", // geçersiz tarih
      extra: "ignored",
    });
    assert.equal(parsed.enabled, true);
    assert.equal(parsed.text, "Merhaba dünya");
    assert.deepEqual(parsed.translations, { en: { text: "Hello world" } });
    assert.equal(parsed.starts_on, "2026-12-01");
    assert.equal(parsed.ends_on, null);
  });

  it("treats enabled only when strictly true and caps text length", () => {
    assert.equal(parseAnnouncement({ enabled: "true", text: "a" }).enabled, false);
    assert.equal(parseAnnouncement({ enabled: true, text: "a".repeat(500) }).text.length, ANNOUNCEMENT_MAX_LENGTH);
  });
});

describe("validateAnnouncement", () => {
  it("requires text when enabled", () => {
    assert.match(validateAnnouncement({ ...base, text: "  " }) ?? "", /Türkçe metni/);
    assert.equal(validateAnnouncement({ ...base, enabled: false, text: "" }), null);
  });

  it("rejects an end date before the start date", () => {
    assert.match(validateAnnouncement({ ...base, starts_on: "2026-12-10", ends_on: "2026-12-09" }) ?? "", /Bitiş/);
    assert.equal(validateAnnouncement({ ...base, starts_on: "2026-12-10", ends_on: "2026-12-10" }), null);
  });

  it("rejects over-long text", () => {
    assert.match(validateAnnouncement({ ...base, text: "a".repeat(ANNOUNCEMENT_MAX_LENGTH + 1) }) ?? "", /en fazla/);
  });
});

describe("announcementForSave", () => {
  it("writes {} when there is no text and it is disabled", () => {
    assert.deepEqual(announcementForSave(emptyAnnouncement()), {});
    assert.deepEqual(announcementForSave({ ...emptyAnnouncement(), text: "  " }), {});
  });

  it("keeps the text of a disabled announcement and omits empty parts", () => {
    assert.deepEqual(announcementForSave({ ...base, enabled: false, translations: {} }), {
      enabled: false,
      text: "Cuma akşamı canlı müzik!",
    });
  });

  it("round-trips through parseAnnouncement", () => {
    const full = { ...base, starts_on: "2026-12-01", ends_on: "2026-12-31" };
    assert.deepEqual(parseAnnouncement(announcementForSave(full)), full);
  });

  it("never splits an emoji when truncating at the limit", () => {
    const text = "a".repeat(ANNOUNCEMENT_MAX_LENGTH - 1) + "😀😀"; // 201 kod noktası
    const saved = announcementForSave({ ...base, text, translations: { en: { text } } });
    const out = saved.text as string;
    assert.equal(Array.from(out).length, ANNOUNCEMENT_MAX_LENGTH);
    assert.ok(out.endsWith("😀"));
    assert.doesNotMatch(out, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    const en = (saved.translations as { en: { text: string } }).en.text;
    assert.equal(Array.from(en).length, ANNOUNCEMENT_MAX_LENGTH);
  });

  it("drops blank translations", () => {
    const saved = announcementForSave({ ...base, translations: { en: { text: "  " }, de: { text: "Hallo" } } });
    assert.deepEqual(saved.translations, { de: { text: "Hallo" } });
  });
});

describe("isAnnouncementLive", () => {
  // Europe/Istanbul = UTC+3 (yaz saati yok).
  const at = (iso: string) => new Date(iso);

  it("is false when disabled, empty or null", () => {
    assert.equal(isAnnouncementLive(null, new Date()), false);
    assert.equal(isAnnouncementLive({ ...base, enabled: false }, new Date()), false);
    assert.equal(isAnnouncementLive({ ...base, text: "" }, new Date()), false);
  });

  it("is always live without dates", () => {
    assert.equal(isAnnouncementLive(base, at("2026-12-05T12:00:00Z")), true);
  });

  it("respects the start date in venue time", () => {
    const a = { ...base, starts_on: "2026-12-10" };
    // 9 Aralık 22:30 UTC = 10 Aralık 01:30 İstanbul → başladı
    assert.equal(isAnnouncementLive(a, at("2026-12-09T22:30:00Z")), true);
    // 9 Aralık 20:30 UTC = 9 Aralık 23:30 İstanbul → başlamadı
    assert.equal(isAnnouncementLive(a, at("2026-12-09T20:30:00Z")), false);
  });

  it("includes the whole end day and hides it the next day (venue time)", () => {
    const a = { ...base, ends_on: "2026-12-31" };
    // 31 Aralık 23:30 İstanbul (20:30 UTC) → hâlâ görünür
    assert.equal(isAnnouncementLive(a, at("2026-12-31T20:30:00Z")), true);
    // 1 Ocak 00:30 İstanbul (21:30 UTC, 31 Aralık) → bitti
    assert.equal(isAnnouncementLive(a, at("2026-12-31T21:30:00Z")), false);
  });
});

describe("resolveAnnouncementText", () => {
  it("uses the translation, falls back to Turkish", () => {
    assert.equal(resolveAnnouncementText(base, "en"), "Live music on Friday night!");
    assert.equal(resolveAnnouncementText(base, "de"), base.text);
    assert.equal(resolveAnnouncementText(base, "tr"), base.text);
    assert.equal(resolveAnnouncementText(base, "xx"), base.text);
  });
});

describe("publicAnnouncement", () => {
  it("only exposes enabled announcements that have text", () => {
    assert.equal(publicAnnouncement({}), null);
    assert.equal(publicAnnouncement({ enabled: false, text: "x" }), null);
    assert.equal(publicAnnouncement({ enabled: true, text: "  " }), null);
    assert.equal(publicAnnouncement({ enabled: true, text: "x" })?.text, "x");
  });
});

describe("announcementDismissKey", () => {
  it("is stable for the same content and changes when it changes", () => {
    assert.equal(announcementDismissKey(base), announcementDismissKey({ ...base }));
    assert.notEqual(announcementDismissKey(base), announcementDismissKey({ ...base, text: "Başka metin" }));
    assert.notEqual(announcementDismissKey(base), announcementDismissKey({ ...base, ends_on: "2026-12-31" }));
    assert.notEqual(
      announcementDismissKey(base),
      announcementDismissKey({ ...base, translations: { en: { text: "Edited" } } })
    );
  });

  it("is scoped per restaurant", () => {
    assert.notEqual(announcementDismissKey(base, "kafe-a"), announcementDismissKey(base, "kafe-b"));
    assert.equal(announcementDismissKey(base, "kafe-a"), announcementDismissKey({ ...base }, "kafe-a"));
  });
});

describe("integration points", () => {
  it("lets the owner edit the announcement column (latest guard migration)", () => {
    const sql = readFileSync(
      path.join(process.cwd(), "supabase", "migrations", "20261116160000_announcement.sql"),
      "utf8"
    );
    const list = sql.match(/owner_editable\s+text\[\]\s*:=\s*array\[([\s\S]*?)\];/)?.[1] ?? "";
    assert.match(list, /'announcement'/);
    assert.match(list, /'display_currencies'/, "önceki migration'ların kolonları listeden düşmemeli");
    assert.match(list, /'menu_languages'/);
  });

  it("accepts the announcement kind in the AI translate request", () => {
    const ok = aiTranslateRequestSchema.safeParse({
      restaurantId: "11111111-1111-4111-8111-111111111111",
      targetLanguage: "en",
      items: [{ id: "announcement", kind: "announcement", fields: { text: "Merhaba" } }],
    });
    assert.equal(ok.success, true);
    const bad = aiTranslateRequestSchema.safeParse({
      restaurantId: "11111111-1111-4111-8111-111111111111",
      targetLanguage: "en",
      items: [{ id: "announcement", kind: "announcement", fields: { name: "Merhaba" } }],
    });
    assert.equal(bad.success, false);
  });
});
