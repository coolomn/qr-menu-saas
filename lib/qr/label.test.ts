import assert from "node:assert/strict";
import test from "node:test";

import {
  expandLabelInput,
  formatLabel,
  QR_LABEL_MAX_LENGTH,
  readLabelFromSearch,
  sanitizeLabelValue,
  withLabelParam,
} from "./label";

test("sanitizeLabelValue: zararlı karakterleri atar, boşlukları toplar, uzunluğu kısıtlar", () => {
  assert.equal(sanitizeLabelValue("  5 "), "5");
  assert.equal(sanitizeLabelValue("<b>5</b>"), "b5/b");
  assert.equal(sanitizeLabelValue("<script>alert(1)</script>"), "scriptalert1/scr"); // 16 karaktere kısalır
  assert.equal(sanitizeLabelValue('A"B\'C'), "ABC");
  assert.equal(sanitizeLabelValue("Bahçe   3"), "Bahçe 3");
  assert.equal(sanitizeLabelValue("Şişli-12/A"), "Şişli-12/A");
  assert.equal(sanitizeLabelValue("x".repeat(100)).length, QR_LABEL_MAX_LENGTH);
  assert.equal(sanitizeLabelValue(null), "");
  assert.equal(sanitizeLabelValue("   "), "");
});

test("withLabelParam: parametreyi ekler, mevcut sorguyu korur, boş değerde dokunmaz", () => {
  assert.equal(withLabelParam("https://qr.tapmenu.com.tr/cafe", "masa", "5"), "https://qr.tapmenu.com.tr/cafe?masa=5");
  assert.equal(withLabelParam("https://x/menu/a?lang=en", "oda", "101"), "https://x/menu/a?lang=en&oda=101");
  assert.equal(withLabelParam("https://x/a", "masa", "Bahçe 3"), "https://x/a?masa=Bah%C3%A7e%203");
  assert.equal(withLabelParam("https://x/a", "masa", "  "), "https://x/a");
});

test("readLabelFromSearch: oda önceliklidir, değer temizlenir", () => {
  assert.deepEqual(readLabelFromSearch("?masa=7"), { kind: "masa", value: "7" });
  assert.deepEqual(readLabelFromSearch("?oda=101&masa=7"), { kind: "oda", value: "101" });
  assert.deepEqual(readLabelFromSearch("?masa=%3Cb%3E5"), { kind: "masa", value: "b5" });
  assert.equal(readLabelFromSearch("?lang=en"), null);
  assert.equal(readLabelFromSearch(""), null);
  assert.equal(readLabelFromSearch(null), null);
  assert.equal(readLabelFromSearch("?masa=%00%01"), null);
});

test("formatLabel: dile göre kelime", () => {
  assert.equal(formatLabel({ kind: "masa", value: "5" }, "tr"), "Masa 5");
  assert.equal(formatLabel({ kind: "oda", value: "101" }, "en"), "Room 101");
  assert.equal(formatLabel({ kind: "oda", value: "101" }, "de"), "Zimmer 101");
  assert.equal(formatLabel({ kind: "masa", value: "3" }, "xx"), "Masa 3");
});

test("expandLabelInput: aralık, liste ve karışık girdi", () => {
  assert.deepEqual(expandLabelInput("1-5"), { values: ["1", "2", "3", "4", "5"], error: null });
  assert.deepEqual(expandLabelInput("1, 3 ,5"), { values: ["1", "3", "5"], error: null });
  assert.deepEqual(expandLabelInput("8-10, 20, Bahçe 3").values, ["8", "9", "10", "20", "Bahçe 3"]);
  assert.deepEqual(expandLabelInput("2-4, 3, 4-6").values, ["2", "3", "4", "5", "6"]);
  assert.deepEqual(expandLabelInput("A-1").values, ["A-1"]);
  assert.deepEqual(expandLabelInput("").values, []);
});

test("expandLabelInput: hatalı aralık ve üst sınır", () => {
  assert.match(expandLabelInput("10-5").error ?? "", /başlangıç/);
  assert.match(expandLabelInput("1-500").error ?? "", /en fazla 200/);
  assert.equal(expandLabelInput("1-200").values.length, 200);
  assert.match(expandLabelInput("1-150, 300-400").error ?? "", /en fazla 200/);
});

test("sanitizeLabelValue: astral karakter ortadan bölünmez (encodeURIComponent patlamaz)", () => {
  const value = sanitizeLabelValue("𝒜".repeat(20)); // \p{L}, UTF-16'da 2 birim
  assert.equal(Array.from(value).length, QR_LABEL_MAX_LENGTH);
  assert.doesNotThrow(() => encodeURIComponent(value));
  assert.doesNotThrow(() => encodeURIComponent(withLabelParam("https://x/a", "masa", "𝒜".repeat(20))));
});
