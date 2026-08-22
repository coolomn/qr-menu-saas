import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  estimateJsonByteSize,
  type PublicMenuBootstrapPayload,
  type PublicMenuFullPayload,
} from "./load-public-menu";
import {
  applyMenuNavigationIntent,
  canRenderMenuView,
  menuCollectionsFromBootstrap,
  menuPickerFromBootstrap,
  shouldPrefetchPublicMenuContent,
  shouldSkipContentFetch,
} from "./public-menu-client";

const sampleBootstrap: PublicMenuBootstrapPayload = {
  restaurant: {
    slug: "demo",
    name: "Demo Restoran",
    logo_url: "https://cdn.example/logo.webp",
    primary_color: "#2563eb",
    slider_images: ["https://cdn.example/s1.webp"],
    welcome_bg_url: "https://cdn.example/bg.webp",
    instagram: "@demo",
    logo_display_mode: "auto",
    theme_id: "classic",
    font_style_id: "classic",
  },
  menu_collections: [
    {
      id: "mc-1",
      name: "Kahvaltı",
      name_en: "Breakfast",
      name_ru: null,
      description: null,
      start_time: "08:00",
      end_time: "12:00",
      sort_order: 0,
      card_visual_type: "icon",
      card_image_url: null,
    },
  ],
  menu_picker: { enabled: true, default_menu_collection_id: "mc-1" },
};

function buildSampleFullPayload(productCount: number): PublicMenuFullPayload {
  const products = Array.from({ length: productCount }, (_, index) => ({
    id: `p-${index}`,
    category_id: "c-1",
    name: `Ürün ${index}`,
    name_en: `Product ${index}`,
    name_ru: `Продукт ${index}`,
    description: "Uzun açıklama metni ".repeat(8),
    description_en: "Long description ".repeat(8),
    description_ru: "Описание ".repeat(8),
    price: "120",
    image_url: `https://cdn.example/products/${index}.webp`,
    thumbnail_url: `https://cdn.example/products/${index}-thumb.webp`,
    allergens: ["gluten"],
    menu_collection_ids: ["mc-1"],
    sort_order: index,
    variants: [
      {
        id: `v-${index}`,
        label: "Büyük",
        label_en: "Large",
        label_ru: null,
        price: "150",
        sort_order: 0,
      },
    ],
  }));

  return {
    ...sampleBootstrap,
    categories: [
      {
        id: "c-1",
        name: "Ana",
        name_en: "Main",
        name_ru: null,
        main_group: "YİYECEKLER",
        main_group_en: null,
        main_group_ru: null,
        sort_order: 0,
        menu_collection_ids: ["mc-1"],
      },
    ],
    products,
  };
}

describe("bootstrap payload shape", () => {
  it("does not include products or categories", () => {
    assert.equal("products" in sampleBootstrap, false);
    assert.equal("categories" in sampleBootstrap, false);
    assert.ok(Array.isArray(sampleBootstrap.menu_collections));
    assert.ok(sampleBootstrap.restaurant.name);
  });

  it("is much smaller than a full menu payload", () => {
    const bootstrapBytes = estimateJsonByteSize(sampleBootstrap);
    const fullBytes = estimateJsonByteSize(buildSampleFullPayload(150));
    assert.ok(bootstrapBytes < fullBytes / 10);
    assert.ok(bootstrapBytes < 5_000);
    assert.ok(fullBytes > 100_000);
  });
});

describe("shouldPrefetchPublicMenuContent", () => {
  it("prefetches for legacy flow and single-menu restaurants", () => {
    assert.equal(
      shouldPrefetchPublicMenuContent({
        useCollectionFlow: false,
        menuPicker: { enabled: true, default_menu_collection_id: "x" },
      }),
      true
    );
    assert.equal(
      shouldPrefetchPublicMenuContent({
        useCollectionFlow: true,
        menuPicker: { enabled: false, default_menu_collection_id: "mc-1" },
      }),
      true
    );
  });

  it("does not prefetch for multi-menu picker welcome screen", () => {
    assert.equal(
      shouldPrefetchPublicMenuContent({
        useCollectionFlow: true,
        menuPicker: { enabled: true, default_menu_collection_id: "mc-1" },
      }),
      false
    );
  });
});

describe("content fetch dedupe", () => {
  it("skips when already loaded or loading", () => {
    assert.equal(shouldSkipContentFetch({ menuDataLoaded: true, menuDataLoading: false }), true);
    assert.equal(shouldSkipContentFetch({ menuDataLoaded: false, menuDataLoading: true }), true);
    assert.equal(shouldSkipContentFetch({ menuDataLoaded: false, menuDataLoading: false }), false);
  });
});

describe("menu view gating", () => {
  it("requires loaded menu data before rendering menu view", () => {
    assert.equal(canRenderMenuView(false), false);
    assert.equal(canRenderMenuView(true), true);
  });
});

describe("menu navigation intent", () => {
  it("applies collection and category navigation when content is ready", () => {
    let view: "welcome" | "menu" = "welcome";
    let selected: string | null = null;
    let group: string | null = null;
    let category: string | null = null;

    applyMenuNavigationIntent(
      { kind: "menu", menuCollectionId: "mc-1", mainGroup: "YİYECEKLER", categoryId: "c-9" },
      {
        setSelectedMenuCollectionId: (id) => {
          selected = id;
        },
        setMenuMainGroup: (g) => {
          group = g;
        },
        setActiveCategory: (id) => {
          category = id;
        },
        setView: (next) => {
          view = next;
        },
      }
    );

    assert.equal(view, "menu");
    assert.equal(selected, "mc-1");
    assert.equal(group, "YİYECEKLER");
    assert.equal(category, "c-9");
  });
});

describe("bootstrap helpers", () => {
  it("normalizes picker and collections defaults", () => {
    assert.deepEqual(menuPickerFromBootstrap(undefined), {
      enabled: false,
      default_menu_collection_id: null,
    });
    assert.deepEqual(menuCollectionsFromBootstrap(undefined), []);
  });
});

describe("full endpoint backward compatibility shape", () => {
  it("still exposes restaurant, menu collections, categories and products together", () => {
    const full = buildSampleFullPayload(2);
    assert.ok(full.restaurant);
    assert.ok(Array.isArray(full.menu_collections));
    assert.ok(Array.isArray(full.categories));
    assert.ok(Array.isArray(full.products));
    assert.equal(full.products.length, 2);
  });
});
