import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertImportStoragePath, isOwnImportFilePath } from "./paths";

const R = "11111111-1111-1111-1111-111111111111";
const U = "22222222-2222-2222-2222-222222222222";
const OTHER_R = "44444444-4444-4444-4444-444444444444";
const OTHER_U = "33333333-3333-3333-3333-333333333333";

describe("isOwnImportFilePath", () => {
  it("accepts a file in this restaurant + user import folder", () => {
    assert.equal(isOwnImportFilePath(`restaurants/${R}/imports/${U}/123-menu.pdf`, R, U), true);
  });

  it("accepts file names containing double dots (not a traversal segment)", () => {
    assert.equal(isOwnImportFilePath(`restaurants/${R}/imports/${U}/123-menu..pdf`, R, U), true);
  });

  it("rejects another user's or another restaurant's import file", () => {
    assert.equal(isOwnImportFilePath(`restaurants/${R}/imports/${OTHER_U}/a.pdf`, R, U), false);
    assert.equal(isOwnImportFilePath(`restaurants/${OTHER_R}/imports/${U}/a.pdf`, R, U), false);
  });

  it("rejects non-import paths (e.g. product images)", () => {
    assert.equal(isOwnImportFilePath(`restaurants/${R}/products/123.webp`, R, U), false);
    assert.equal(isOwnImportFilePath(`restaurants/${R}/logo.webp`, R, U), false);
  });

  it("rejects traversal, nested and malformed paths", () => {
    assert.equal(isOwnImportFilePath(`restaurants/${R}/imports/${U}/..`, R, U), false);
    assert.equal(isOwnImportFilePath(`restaurants/${R}/imports/${U}/.`, R, U), false);
    assert.equal(isOwnImportFilePath(`restaurants/${R}/imports/${U}/../x.pdf`, R, U), false);
    assert.equal(isOwnImportFilePath(`restaurants/${R}/imports/${U}/a/b.pdf`, R, U), false);
    assert.equal(isOwnImportFilePath(`/restaurants/${R}/imports/${U}/a.pdf`, R, U), false);
    assert.equal(isOwnImportFilePath(`restaurants/${R}/imports/${U}/`, R, U), false);
    assert.equal(isOwnImportFilePath(`restaurants//imports/${U}/a.pdf`, "", U), false);
    assert.equal(isOwnImportFilePath("", R, U), false);
  });
});

describe("assertImportStoragePath", () => {
  it("throws when job path points to another restaurant", () => {
    assert.throws(() => assertImportStoragePath(`restaurants/${OTHER_R}/imports/${U}/a.pdf`, R, U));
  });

  it("throws when job path points to another user", () => {
    assert.throws(() => assertImportStoragePath(`restaurants/${R}/imports/${OTHER_U}/a.pdf`, R, U));
  });

  it("throws on nested paths so analysis and cleanup accept the same set", () => {
    assert.throws(() => assertImportStoragePath(`restaurants/${R}/imports/${U}/sub/a.pdf`, R, U));
  });

  it("allows own path", () => {
    assert.doesNotThrow(() => assertImportStoragePath(`restaurants/${R}/imports/${U}/a.pdf`, R, U));
  });

  it("rejects legacy menu-images import paths (public bucket, no limits)", () => {
    assert.throws(() => assertImportStoragePath(`imports/${U}/a.pdf`, R, U));
    assert.throws(() => assertImportStoragePath(`imports/${U}/../x.pdf`, R, U));
  });
});
