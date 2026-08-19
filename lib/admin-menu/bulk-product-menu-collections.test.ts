import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bulkProductMenuCollectionsSchema } from "./validation";
import {
  applyBulkMenuLinksToMap,
  assertBulkTargetOwnership,
  findIncompatibleBulkAddTargets,
  formatBulkProductMenuResultMessage,
  formatIncompatibleBulkAddError,
  getBulkMenuLinkCheckState,
  mergeProductMenuLinksMap,
  planBulkProductMenuCollectionChanges,
} from "./bulk-product-menu-collections";
import { resolveSelectedRestaurantFromList } from "../admin-auth/owner-restaurants";

const restaurantA = "11111111-1111-4111-8111-111111111111";
const restaurantB = "22222222-2222-4222-8222-222222222222";
const productA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const productB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const productOther = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const breakfast = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const allDay = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const drinks = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const otherMenu = "99999999-9999-4999-8999-999999999999";
const categoryId = "12121212-1212-4121-8121-121212121212";

const products = [
  { id: productA, restaurant_id: restaurantA, category_id: categoryId },
  { id: productB, restaurant_id: restaurantA, category_id: categoryId },
];

const available = new Map([[categoryId, [breakfast, allDay, drinks]]]);

describe("bulkProductMenuCollectionsSchema", () => {
  it("rejects empty productIds and menuCollectionIds", () => {
    const emptyProducts = bulkProductMenuCollectionsSchema.safeParse({
      restaurantId: restaurantA,
      productIds: [],
      menuCollectionIds: [breakfast],
      action: "add",
    });
    const emptyMenus = bulkProductMenuCollectionsSchema.safeParse({
      restaurantId: restaurantA,
      productIds: [productA],
      menuCollectionIds: [],
      action: "remove",
    });
    assert.equal(emptyProducts.success, false);
    assert.equal(emptyMenus.success, false);
  });
});

describe("assertBulkTargetOwnership", () => {
  it("rejects a product from another restaurant", () => {
    const result = assertBulkTargetOwnership({
      restaurantId: restaurantA,
      requestedProductIds: [productA, productOther],
      products: [
        ...products,
        { id: productOther, restaurant_id: restaurantB, category_id: categoryId },
      ],
      requestedMenuIds: [breakfast],
      menus: [{ id: breakfast, restaurant_id: restaurantA, is_active: true }],
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 403);
  });

  it("rejects a menu collection from another restaurant", () => {
    const result = assertBulkTargetOwnership({
      restaurantId: restaurantA,
      requestedProductIds: [productA],
      products,
      requestedMenuIds: [otherMenu],
      menus: [{ id: otherMenu, restaurant_id: restaurantB, is_active: true }],
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 403);
  });
});

describe("planBulkProductMenuCollectionChanges", () => {
  it("adds two products to breakfast without duplicating an existing link", () => {
    const plan = planBulkProductMenuCollectionChanges({
      action: "add",
      productIds: [productA, productB],
      menuCollectionIds: [breakfast],
      products,
      existingLinks: [
        { product_id: productA, menu_collection_id: breakfast },
        { product_id: productA, menu_collection_id: allDay },
        { product_id: productB, menu_collection_id: allDay },
      ],
      availableMenuIdsByCategory: available,
    });

    assert.deepEqual(
      plan.toInsert,
      [{ product_id: productB, menu_collection_id: breakfast }]
    );
    assert.equal(plan.linksAdded, 1);
    assert.ok(plan.linksByProduct[productA].includes(breakfast));
    assert.ok(plan.linksByProduct[productA].includes(allDay));
    assert.ok(plan.linksByProduct[productB].includes(breakfast));
    assert.ok(plan.linksByProduct[productB].includes(allDay));
  });

    it("does not plan an insert when the category is not linked to the menu", () => {
    const lunch = "abababab-abab-4aba-8aba-abababababab";
    const plan = planBulkProductMenuCollectionChanges({
      action: "add",
      productIds: [productA],
      menuCollectionIds: [lunch],
      products,
      existingLinks: [{ product_id: productA, menu_collection_id: breakfast }],
      availableMenuIdsByCategory: available,
    });
    assert.deepEqual(plan.toInsert, []);
    assert.ok(!plan.linksByProduct[productA].includes(lunch));
    assert.ok(plan.linksByProduct[productA].includes(breakfast));
  });

  it("removes breakfast only and keeps All Day", () => {
    const plan = planBulkProductMenuCollectionChanges({
      action: "remove",
      productIds: [productA, productB],
      menuCollectionIds: [breakfast],
      products,
      existingLinks: [
        { product_id: productA, menu_collection_id: breakfast },
        { product_id: productA, menu_collection_id: allDay },
        { product_id: productB, menu_collection_id: breakfast },
      ],
      availableMenuIdsByCategory: available,
    });

    assert.equal(plan.linksRemoved, 2);
    assert.deepEqual(
      plan.toDelete.sort((a, b) => a.product_id.localeCompare(b.product_id)),
      [
        { product_id: productA, menu_collection_id: breakfast },
        { product_id: productB, menu_collection_id: breakfast },
      ].sort((a, b) => a.product_id.localeCompare(b.product_id))
    );
    assert.deepEqual(plan.linksByProduct[productA], [allDay]);
    assert.deepEqual(plan.linksByProduct[productB], []);
    assert.ok(!plan.linksByProduct[productA].includes(breakfast));
  });
});

describe("findIncompatibleBulkAddTargets", () => {
  const coldStarters = "13131313-1313-4131-8131-131313131313";
  const lunch = "abababab-abab-4aba-8aba-abababababab";
  const productC = "cececece-cece-4cec-8cec-cececececece";

  it("allows add when the category is already linked to the menu", () => {
    const items = findIncompatibleBulkAddTargets({
      products,
      menuCollectionIds: [breakfast],
      availableMenuIdsByCategory: available,
      categoryNames: { [categoryId]: "Soğuk Başlangıçlar" },
      menuNames: { [breakfast]: "Akşam Menüsü" },
    });
    assert.equal(items.length, 0);
  });

  it("rejects add when the category is not linked to the menu", () => {
    const items = findIncompatibleBulkAddTargets({
      products: [{ id: productA, category_id: categoryId }],
      menuCollectionIds: [lunch],
      availableMenuIdsByCategory: available,
      categoryNames: { [categoryId]: "Soğuk Başlangıçlar" },
      menuNames: { [lunch]: "Öğle Menüsü" },
    });
    assert.equal(items.length, 1);
    assert.equal(items[0].categoryName, "Soğuk Başlangıçlar");
    assert.equal(items[0].menuName, "Öğle Menüsü");
    assert.match(
      formatIncompatibleBulkAddError(items),
      /Soğuk Başlangıçlar kategorisi Öğle Menüsü'ne bağlı değil/
    );
    assert.match(formatIncompatibleBulkAddError(items), /müşteri menüsünde görünmez/);
  });

  it("rejects the whole batch when one product category is incompatible", () => {
    const items = findIncompatibleBulkAddTargets({
      products: [
        { id: productA, category_id: categoryId },
        { id: productB, category_id: categoryId },
        { id: productC, category_id: coldStarters },
      ],
      menuCollectionIds: [lunch],
      availableMenuIdsByCategory: new Map([
        [categoryId, [breakfast, allDay, drinks]],
        [coldStarters, [breakfast, lunch]],
      ]),
      categoryNames: {
        [categoryId]: "Soğuk Başlangıçlar",
        [coldStarters]: "Sıcak Başlangıçlar",
      },
      menuNames: { [lunch]: "Öğle Menüsü" },
    });
    assert.equal(items.length, 1);
    assert.equal(items[0].categoryId, categoryId);
  });
});

describe("getBulkMenuLinkCheckState", () => {
  const p1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
  const p2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
  const p3 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
  const p4 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4";
  const evening = breakfast;
  const selected = [p1, p2, p3, p4];

  it("is indeterminate when only some selected products are on the menu", () => {
    const links = {
      [p1]: [evening],
      [p2]: [evening],
      [p3]: [evening],
      [p4]: [allDay],
    };
    assert.equal(getBulkMenuLinkCheckState(evening, selected, links), "some");
  });

  it("is checked when every selected product is on the menu", () => {
    const links = {
      [p1]: [evening, allDay],
      [p2]: [evening],
      [p3]: [evening],
      [p4]: [evening],
    };
    assert.equal(getBulkMenuLinkCheckState(evening, selected, links), "all");
  });

  it("is unchecked when no selected product is on the menu", () => {
    const links = {
      [p1]: [allDay],
      [p2]: [allDay],
      [p3]: [],
      [p4]: [drinks],
    };
    assert.equal(getBulkMenuLinkCheckState(evening, selected, links), "none");
  });
});

describe("applyBulkMenuLinksToMap / mergeProductMenuLinksMap", () => {
  it("updates badges locally after add and remove without dropping other menus", () => {
    const current = {
      [productA]: [breakfast, allDay],
      [productB]: [allDay],
    };
    const afterAdd = applyBulkMenuLinksToMap(current, [productA, productB], [breakfast], "add");
    assert.ok(afterAdd[productA].includes(breakfast));
    assert.ok(afterAdd[productA].includes(allDay));
    assert.ok(afterAdd[productB].includes(breakfast));
    assert.ok(afterAdd[productB].includes(allDay));

    const afterRemove = applyBulkMenuLinksToMap(afterAdd, [productA, productB], [breakfast], "remove");
    assert.ok(!afterRemove[productA].includes(breakfast));
    assert.ok(afterRemove[productA].includes(allDay));
    assert.ok(!afterRemove[productB].includes(breakfast));
    assert.ok(afterRemove[productB].includes(allDay));
  });

  it("lets server linksByProduct replace local product rows", () => {
    const current = { [productA]: [allDay] };
    const merged = mergeProductMenuLinksMap(current, { [productA]: [breakfast, allDay] });
    assert.deepEqual(merged[productA].sort(), [allDay, breakfast].sort());
  });
});

describe("formatBulkProductMenuResultMessage", () => {
  it("formats add and remove copy", () => {
    assert.equal(
      formatBulkProductMenuResultMessage({
        action: "add",
        productCount: 12,
        linksAdded: 18,
        linksRemoved: 0,
      }),
      "12 ürün güncellendi. 18 menü bağlantısı eklendi."
    );
    assert.equal(
      formatBulkProductMenuResultMessage({
        action: "remove",
        productCount: 8,
        linksAdded: 0,
        linksRemoved: 8,
      }),
      "8 ürün seçili menülerden çıkarıldı."
    );
  });
});

describe("owner restaurant selection", () => {
  it("keeps single-restaurant auto-select and multi-restaurant picker", () => {
    const one = resolveSelectedRestaurantFromList(
      [{ id: restaurantA, name: "A", slug: "a", logo_url: null }],
      "owner-1"
    );
    assert.equal(one.needsPicker, false);
    assert.equal(one.selected?.id, restaurantA);

    const many = resolveSelectedRestaurantFromList(
      [
        { id: restaurantA, name: "A", slug: "a", logo_url: null },
        { id: restaurantB, name: "B", slug: "b", logo_url: null },
      ],
      "owner-1"
    );
    assert.equal(many.needsPicker, true);
    assert.equal(many.selected, null);

    const preferred = resolveSelectedRestaurantFromList(
      [
        { id: restaurantA, name: "A", slug: "a", logo_url: null },
        { id: restaurantB, name: "B", slug: "b", logo_url: null },
      ],
      "owner-1",
      restaurantB
    );
    assert.equal(preferred.needsPicker, false);
    assert.equal(preferred.selected?.id, restaurantB);
  });
});
