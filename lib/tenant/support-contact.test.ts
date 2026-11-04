import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSupportWhatsAppUrl } from "./support-contact";

describe("buildSupportWhatsAppUrl", () => {
  it("builds a wa.me link with the restaurant name in the message", () => {
    const url = buildSupportWhatsAppUrl("Uğur Cafe", "90 555 574 72 92");
    assert.ok(url?.startsWith("https://wa.me/905555747292?text="));
    assert.match(decodeURIComponent(url!.split("text=")[1]), /Uğur Cafe için TapMenu aboneliğimi/);
  });

  it("returns null when no number is configured", () => {
    assert.equal(buildSupportWhatsAppUrl("X", null), null);
    assert.equal(buildSupportWhatsAppUrl("X", ""), null);
  });
});
