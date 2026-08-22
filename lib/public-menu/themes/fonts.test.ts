import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeFontStyleId } from "./font-normalize";
import {
  allMenuFontVariableClasses,
  FONT_STYLE_REQUIRED_MENU_FONTS,
  joinMenuFontVariableClasses,
  resolveRequiredMenuFontKeys,
} from "./font-loading-policy";
import {
  getMenuFontShellClassName,
  getMenuFontStylesheetHref,
  MENU_FONT_STYLESHEET_BY_STYLE,
  MENU_FONT_WOFF2_COUNT_BY_STYLE,
} from "./menu-font-css";

const MOCK_VARIABLES = {
  inter: "inter-var",
  dmSans: "dm-sans-var",
  playfair: "playfair-var",
  spaceGrotesk: "space-grotesk-var",
} as const;

describe("resolveRequiredMenuFontKeys", () => {
  it("loads no menu fonts for classic (Geist via root font-sans)", () => {
    assert.deepEqual(resolveRequiredMenuFontKeys("classic"), []);
    assert.deepEqual(FONT_STYLE_REQUIRED_MENU_FONTS.classic, []);
  });

  it("loads only DM Sans for modern", () => {
    assert.deepEqual(resolveRequiredMenuFontKeys("modern"), ["dmSans"]);
  });

  it("loads Inter + Playfair for premium", () => {
    assert.deepEqual(resolveRequiredMenuFontKeys("premium"), ["inter", "playfair"]);
  });

  it("loads Inter + Space Grotesk for geometric", () => {
    assert.deepEqual(resolveRequiredMenuFontKeys("geometric"), ["inter", "spaceGrotesk"]);
  });

  it("falls back to classic for unknown font_style_id", () => {
    assert.deepEqual(resolveRequiredMenuFontKeys("unknown-style"), []);
    assert.deepEqual(resolveRequiredMenuFontKeys(null), []);
  });
});

describe("joinMenuFontVariableClasses", () => {
  it("maps only required font variables per style", () => {
    assert.equal(joinMenuFontVariableClasses("classic", MOCK_VARIABLES), "");
    assert.equal(joinMenuFontVariableClasses("modern", MOCK_VARIABLES), "dm-sans-var");
    assert.equal(
      joinMenuFontVariableClasses("premium", MOCK_VARIABLES),
      "inter-var playfair-var"
    );
    assert.equal(
      joinMenuFontVariableClasses("geometric", MOCK_VARIABLES),
      "inter-var space-grotesk-var"
    );
  });
});

describe("admin font preview", () => {
  it("still exposes all menu font variables for picker preview", () => {
    const classes = allMenuFontVariableClasses(MOCK_VARIABLES);
    assert.match(classes, /inter-var/);
    assert.match(classes, /dm-sans-var/);
    assert.match(classes, /playfair-var/);
    assert.match(classes, /space-grotesk-var/);
  });
});

describe("public menu font stylesheets", () => {
  it("maps each style to an isolated public CSS file", () => {
    assert.equal(getMenuFontStylesheetHref("classic"), null);
    assert.equal(getMenuFontStylesheetHref("modern"), MENU_FONT_STYLESHEET_BY_STYLE.modern);
    assert.equal(getMenuFontStylesheetHref("premium"), MENU_FONT_STYLESHEET_BY_STYLE.premium);
    assert.equal(getMenuFontStylesheetHref("geometric"), MENU_FONT_STYLESHEET_BY_STYLE.geometric);
    assert.equal(normalizeFontStyleId("modern"), "modern");
  });

  it("sets shell classes only for non-classic styles", () => {
    assert.equal(getMenuFontShellClassName("classic"), "");
    assert.equal(getMenuFontShellClassName("modern"), "menu-font-shell-modern");
  });

  it("documents expected woff2 counts per style (excluding root Geist)", () => {
    assert.equal(MENU_FONT_WOFF2_COUNT_BY_STYLE.modern, 2);
    assert.equal(MENU_FONT_WOFF2_COUNT_BY_STYLE.premium, 6);
    assert.equal(MENU_FONT_WOFF2_COUNT_BY_STYLE.geometric, 5);
    assert.equal(MENU_FONT_WOFF2_COUNT_BY_STYLE.classic, 0);
  });
});

describe("TR / RU subset policy", () => {
  it("documents per-font subset files (latin-ext + cyrillic where supported)", () => {
    assert.equal(FONT_STYLE_REQUIRED_MENU_FONTS.modern.length, 1);
    assert.equal(FONT_STYLE_REQUIRED_MENU_FONTS.premium.length, 2);
  });
});
