import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PublicMenuCollection } from "./menu-collections";
import type { Schedule } from "./schedule";
import {
  effectiveMenuPicker,
  menuServiceNotes,
  resolveCategoryService,
  resolveProductService,
  serviceNote,
  visibleMenuCollections,
} from "./service-view";

const EVENING = new Date("2026-11-16T20:00:00+03:00");
const NOON = new Date("2026-11-16T12:00:00+03:00");
const day = (outside: "show" | "hide"): Schedule => ({
  starts_on: null,
  ends_on: null,
  windows: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "11:00", end: "16:00" }],
  outside,
});

function menu(id: string, schedule: Schedule | null): PublicMenuCollection {
  return {
    id,
    name: id,
    name_en: null,
    name_ru: null,
    description: null,
    start_time: null,
    end_time: null,
    sort_order: 0,
    card_visual_type: "icon",
    card_image_url: null,
    schedule,
  };
}

describe("menus", () => {
  const pizza = menu("pizza", day("show"));
  const brunch = menu("brunch", day("hide"));
  const all = menu("all", null);

  it("show mode keeps the menu listed and adds a note; hide mode removes it", () => {
    const visible = visibleMenuCollections([pizza, brunch, all], EVENING);
    assert.deepEqual(visible.map((m) => m.id), ["pizza", "all"]);
    assert.deepEqual(menuServiceNotes(visible, "tr", EVENING), {
      pizza: "Şu an servis dışı · Yarın 11:00'de başlar",
    });
    assert.deepEqual(menuServiceNotes(visible, "tr", NOON), {});
  });

  it("picker is re-decided from visible menus", () => {
    const picker = { enabled: true, default_menu_collection_id: "brunch" };
    const visible = visibleMenuCollections([brunch, all], EVENING);
    assert.deepEqual(effectiveMenuPicker(picker, visible), { enabled: false, default_menu_collection_id: "all" });
    assert.equal(effectiveMenuPicker(null, visible), null);
  });

  it("when no menu is visible the default is kept so other products cannot leak in", () => {
    const picker = { enabled: false, default_menu_collection_id: "brunch" };
    const visible = visibleMenuCollections([brunch], EVENING);
    assert.equal(visible.length, 0);
    assert.equal(effectiveMenuPicker(picker, visible)?.default_menu_collection_id, "brunch");
  });
});

describe("categories and products", () => {
  it("combines menu, category and product schedules", () => {
    const product = { schedule: day("show") };
    const category = { schedule: null };
    const res = resolveProductService(product, category, menu("m", null), EVENING);
    assert.equal(res.visible, true);
    assert.equal(res.outside?.level, "product");
    assert.equal(serviceNote(res, "tr", EVENING), "Şu an servis dışı · Yarın 11:00'de başlar");

    const hidden = resolveCategoryService({ schedule: day("hide") }, menu("m", null), EVENING);
    assert.equal(hidden.visible, false);
    assert.equal(serviceNote(hidden, "tr", EVENING), null);
  });

  it("a hidden menu schedule hides everything inside it", () => {
    const res = resolveProductService({}, {}, menu("m", day("hide")), EVENING);
    assert.equal(res.visible, false);
  });

  it("nothing scheduled → visible, no note", () => {
    const res = resolveProductService({}, undefined, null, EVENING);
    assert.equal(serviceNote(res, "tr", EVENING), null);
    assert.equal(res.visible, true);
  });
});

describe("subcategories", () => {
  it("parent category schedule applies to products in a subcategory", () => {
    const hiddenParent = { schedule: day("hide") };
    assert.equal(resolveProductService({}, { schedule: null }, null, EVENING, hiddenParent).visible, false);
    const shownParent = { schedule: day("show") };
    const res = resolveProductService({}, { schedule: null }, null, EVENING, shownParent);
    assert.equal(res.visible, true);
    assert.equal(res.outside?.level, "category");
  });

  it("subcategory's own schedule wins the note over the parent's", () => {
    const sub = { schedule: { ...day("show"), windows: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "10:00" }] } };
    const parent = { schedule: day("show") };
    const res = resolveProductService({}, sub, null, EVENING, parent);
    assert.equal(serviceNote(res, "tr", EVENING), "Şu an servis dışı · Yarın 09:00'de başlar");
  });
});
