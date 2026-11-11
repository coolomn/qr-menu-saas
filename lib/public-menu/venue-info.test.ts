import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cleanSocialLinksForSave,
  defaultOpeningHours,
  formatPriceDate,
  isOpenNow,
  latestPriceUpdate,
  normalizeBadgeIds,
  normalizeWhatsappNumber,
  parseNutritionInput,
  parseOpeningHours,
  resolveSocialLinks,
  sanitizeHttpUrl,
  whatsappUrl,
} from "./venue-info";

describe("sanitizeHttpUrl", () => {
  it("accepts http(s) and adds scheme", () => {
    assert.equal(sanitizeHttpUrl("https://g.page/r/abc"), "https://g.page/r/abc");
    assert.equal(sanitizeHttpUrl("www.site.com/x"), "https://www.site.com/x");
  });
  it("rejects dangerous or malformed values", () => {
    assert.equal(sanitizeHttpUrl("javascript:alert(1)"), null);
    assert.equal(sanitizeHttpUrl("data:text/html,x"), null);
    assert.equal(sanitizeHttpUrl("https://a.com/ \"onclick"), null);
    assert.equal(sanitizeHttpUrl("localhost"), null);
    assert.equal(sanitizeHttpUrl(""), null);
    assert.equal(sanitizeHttpUrl(42), null);
  });
});

describe("normalizeWhatsappNumber", () => {
  it("normalizes Turkish formats", () => {
    assert.equal(normalizeWhatsappNumber("0555 574 72 92"), "905555747292");
    assert.equal(normalizeWhatsappNumber("+90 555 574 72 92"), "905555747292");
    assert.equal(normalizeWhatsappNumber("5555747292"), "905555747292");
    assert.equal(normalizeWhatsappNumber("0090 555 574 72 92"), "905555747292");
  });
  it("rejects invalid", () => {
    assert.equal(normalizeWhatsappNumber("123"), null);
    assert.equal(normalizeWhatsappNumber("abc"), null);
  });
  it("builds wa.me link", () => {
    assert.equal(whatsappUrl("905555747292"), "https://wa.me/905555747292");
  });
});

describe("social links", () => {
  it("resolves handles and urls, drops bad ones", () => {
    const links = resolveSocialLinks({
      tiktok: "@mekan",
      facebook: "javascript:alert(1)",
      website: "mekan.com",
      x: "",
    });
    assert.deepEqual(
      links.map((l) => [l.id, l.url]),
      [
        ["tiktok", "https://www.tiktok.com/@mekan"],
        ["website", "https://mekan.com/"],
      ]
    );
  });
  it("cleans for save", () => {
    assert.deepEqual(cleanSocialLinksForSave({ tiktok: " @a ", facebook: "  " }), { tiktok: "@a" });
  });
});

describe("badges", () => {
  it("drops unknown/duplicate ids and keeps defined order", () => {
    assert.deepEqual(normalizeBadgeIds(["spicy", "x", "vegan", "spicy"]), ["vegan", "spicy"]);
    assert.deepEqual(normalizeBadgeIds(null), []);
  });
});

describe("opening hours", () => {
  it("validates shape", () => {
    assert.equal(parseOpeningHours(null), null);
    assert.equal(parseOpeningHours({ mon: {} }), null);
    assert.ok(parseOpeningHours(defaultOpeningHours()));
  });
  it("isOpenNow handles normal and overnight ranges (Europe/Istanbul = UTC+3)", () => {
    const hours = defaultOpeningHours();
    hours.fri = { closed: false, open: "22:00", close: "02:00" };
    hours.sat = { closed: true, open: "09:00", close: "23:00" };
    hours.mon = { closed: false, open: "09:00", close: "18:00" };
    // Pazartesi 2026-11-09 12:00 TR = 09:00Z
    assert.equal(isOpenNow(hours, new Date("2026-11-09T09:00:00Z")), true);
    // Pazartesi 19:00 TR → kapalı
    assert.equal(isOpenNow(hours, new Date("2026-11-09T16:00:00Z")), false);
    // Cuma 23:00 TR → açık (gece aralığı)
    assert.equal(isOpenNow(hours, new Date("2026-11-13T20:00:00Z")), true);
    // Cumartesi 01:00 TR → Cuma'nın aralığı sürüyor → açık
    assert.equal(isOpenNow(hours, new Date("2026-11-13T22:00:00Z")), true);
    // Cumartesi 03:00 TR → kapalı
    assert.equal(isOpenNow(hours, new Date("2026-11-14T00:00:00Z")), false);
    // Cumartesi öğlen: kapalı gün
    assert.equal(isOpenNow(hours, new Date("2026-11-14T09:00:00Z")), false);
  });
});

describe("price date", () => {
  it("picks latest and formats in TR time zone", () => {
    const latest = latestPriceUpdate([
      { price_updated_at: null },
      { price_updated_at: "2026-11-01T10:00:00Z" },
      { price_updated_at: "2026-11-12T21:30:00Z" },
    ]);
    assert.equal(latest, "2026-11-12T21:30:00Z");
    // 21:30Z = 00:30 TR ertesi gün
    assert.equal(formatPriceDate(latest!, "tr"), "13.11.2026");
    assert.equal(latestPriceUpdate([{}]), null);
  });
});

describe("parseNutritionInput", () => {
  it("handles empty, valid and invalid", () => {
    assert.equal(parseNutritionInput("", { integer: true, max: 20000 }), null);
    assert.equal(parseNutritionInput("320", { integer: true, max: 20000 }), 320);
    assert.equal(parseNutritionInput("12,34", { integer: false, max: 5000 }), 12.3);
    assert.equal(parseNutritionInput("-1", { integer: true, max: 20000 }), undefined);
    assert.equal(parseNutritionInput("abc", { integer: true, max: 20000 }), undefined);
    assert.equal(parseNutritionInput("99999", { integer: true, max: 20000 }), undefined);
  });
});
