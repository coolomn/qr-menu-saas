import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public/fonts/menu/woff2");
const pkg = (name) => join(root, "node_modules/@fontsource", name, "files");

mkdirSync(outDir, { recursive: true });

/** @type {Array<{ out: string; src: string }>} */
const copies = [
  { out: "dm-sans-latin.woff2", src: "dm-sans-latin-400-normal.woff2" },
  { out: "dm-sans-latin-ext.woff2", src: "dm-sans-latin-ext-400-normal.woff2" },
  { out: "inter-latin.woff2", src: "inter-latin-400-normal.woff2" },
  { out: "inter-latin-ext.woff2", src: "inter-latin-ext-400-normal.woff2" },
  { out: "inter-cyrillic.woff2", src: "inter-cyrillic-400-normal.woff2" },
  { out: "playfair-latin.woff2", src: "playfair-display-latin-400-normal.woff2" },
  { out: "playfair-latin-ext.woff2", src: "playfair-display-latin-ext-400-normal.woff2" },
  { out: "playfair-cyrillic.woff2", src: "playfair-display-cyrillic-400-normal.woff2" },
  { out: "space-grotesk-latin.woff2", src: "space-grotesk-latin-400-normal.woff2" },
  { out: "space-grotesk-latin-ext.woff2", src: "space-grotesk-latin-ext-400-normal.woff2" },
];

for (const { out, src } of copies) {
  const family = src.startsWith("dm-sans")
    ? "dm-sans"
    : src.startsWith("inter")
      ? "inter"
      : src.startsWith("playfair")
        ? "playfair-display"
        : "space-grotesk";
  cpSync(join(pkg(family), src), join(outDir, out));
}

function face(family, file, range) {
  return `@font-face{font-family:'${family}';font-style:normal;font-weight:400;font-display:swap;src:url(/fonts/menu/woff2/${file}) format('woff2');unicode-range:${range}}`;
}

const latinRange =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const latinExtRange =
  "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";
const cyrillicRange =
  "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116";

writeFileSync(
  join(root, "public/fonts/menu/modern.css"),
  [
    face("DM Sans", "dm-sans-latin-ext.woff2", latinExtRange),
    face("DM Sans", "dm-sans-latin.woff2", latinRange),
    ".menu-font-shell-modern{--font-menu-dm-sans:'DM Sans',system-ui,sans-serif}",
  ].join("\n")
);

const interFaces = [
  face("Inter", "inter-latin-ext.woff2", latinExtRange),
  face("Inter", "inter-latin.woff2", latinRange),
  face("Inter", "inter-cyrillic.woff2", cyrillicRange),
];

const playfairFaces = [
  face("Playfair Display", "playfair-latin-ext.woff2", latinExtRange),
  face("Playfair Display", "playfair-latin.woff2", latinRange),
  face("Playfair Display", "playfair-cyrillic.woff2", cyrillicRange),
];

const spaceGroteskFaces = [
  face("Space Grotesk", "space-grotesk-latin-ext.woff2", latinExtRange),
  face("Space Grotesk", "space-grotesk-latin.woff2", latinRange),
];

writeFileSync(
  join(root, "public/fonts/menu/premium.css"),
  [
    ...interFaces,
    ...playfairFaces,
    ".menu-font-shell-premium{--font-menu-inter:'Inter',system-ui,sans-serif;--font-menu-playfair:'Playfair Display',Georgia,serif}",
  ].join("\n")
);

writeFileSync(
  join(root, "public/fonts/menu/geometric.css"),
  [
    ...interFaces,
    ...spaceGroteskFaces,
    ".menu-font-shell-geometric{--font-menu-inter:'Inter',system-ui,sans-serif;--font-menu-space-grotesk:'Space Grotesk',system-ui,sans-serif}",
  ].join("\n")
);

console.log(`Synced ${copies.length} menu font files to public/fonts/menu/`);
