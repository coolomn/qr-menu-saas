import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertImportStoragePath, isDeletableImportPath } from "./paths";

const R = "11111111-1111-1111-1111-111111111111";
const U = "22222222-2222-2222-2222-222222222222";
const OTHER_U = "33333333-3333-3333-3333-333333333333";

describe("isDeletableImportPath", () => {
  it("accepts a file in the user's own import folder", () => {
    assert.equal(isDeletableImportPath(`restaurants/${R}/imports/${U}/123-menu.pdf`, U), true);
  });

  it("rejects another user's import file", () => {
    assert.equal(isDeletableImportPath(`restaurants/${R}/imports/${OTHER_U}/123-menu.pdf`, U), false);
  });

  it("rejects non-import paths (e.g. product images)", () => {
    assert.equal(isDeletableImportPath(`restaurants/${R}/products/123.webp`, U), false);
    assert.equal(isDeletableImportPath(`restaurants/${R}/logo.webp`, U), false);
  });

  it("rejects traversal, nested and malformed paths", () => {
    assert.equal(isDeletableImportPath(`restaurants/${R}/imports/${U}/../x.pdf`, U), false);
    assert.equal(isDeletableImportPath(`restaurants/${R}/imports/${U}/a/b.pdf`, U), false);
    assert.equal(isDeletableImportPath(`/restaurants/${R}/imports/${U}/a.pdf`, U), false);
    assert.equal(isDeletableImportPath(`restaurants//imports/${U}/a.pdf`, U), false);
    assert.equal(isDeletableImportPath("", U), false);
  });
});

describe("assertImportStoragePath", () => {
  it("throws when job path points to another restaurant", () => {
    const otherR = "44444444-4444-4444-4444-444444444444";
    assert.throws(() => assertImportStoragePath(`restaurants/${otherR}/imports/${U}/a.pdf`, R, U));
  });

  it("throws when job path points to another user", () => {
    assert.throws(() => assertImportStoragePath(`restaurants/${R}/imports/${OTHER_U}/a.pdf`, R, U));
  });

  it("allows own path", () => {
    assert.doesNotThrow(() => assertImportStoragePath(`restaurants/${R}/imports/${U}/a.pdf`, R, U));
  });
});
