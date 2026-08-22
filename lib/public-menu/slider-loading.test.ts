import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SLIDER_AUTOPLAY_MS,
  SLIDER_FADE_MS,
  countInitialNetworkRequests,
  getInitialSlideLoadIndexes,
  getMountedSlideIndexes,
  getPendingSlidePreloadIndex,
  getPreloadSlideIndex,
  pruneMountedSlideIndexes,
  resolveActiveAfterSlideError,
  resolveAutoplaySlideIndex,
  shouldAutoplayPublicSlider,
  shouldRenderPublicSlider,
} from "./slider-loading";

describe("shouldRenderPublicSlider", () => {
  it("returns false for 0 images", () => {
    assert.equal(shouldRenderPublicSlider([]), false);
  });

  it("returns true for 1+ images", () => {
    assert.equal(shouldRenderPublicSlider(["a.jpg"]), true);
  });
});

describe("shouldAutoplayPublicSlider", () => {
  it("returns false for 0 or 1 image", () => {
    assert.equal(shouldAutoplayPublicSlider([]), false);
    assert.equal(shouldAutoplayPublicSlider(["a.jpg"]), false);
  });

  it("returns true for 2+ images", () => {
    assert.equal(shouldAutoplayPublicSlider(["a.jpg", "b.jpg"]), true);
  });
});

describe("initial network load plan", () => {
  it("loads only active for a single image", () => {
    assert.deepEqual(getInitialSlideLoadIndexes(1), [0]);
    assert.equal(countInitialNetworkRequests(1), 1);
  });

  it("loads active + next for three images", () => {
    assert.deepEqual(getInitialSlideLoadIndexes(3), [0, 1]);
    assert.equal(countInitialNetworkRequests(3), 2);
  });

  it("does not preload a third image on first open", () => {
    const loaded = new Set([0, 1]);
    assert.equal(getPendingSlidePreloadIndex(3, 0, loaded, new Set(), new Set()), null);
    assert.equal(getPreloadSlideIndex(0, 3, new Set()), 1);
    assert.equal(getPreloadSlideIndex(1, 3, new Set()), 2);
    assert.notEqual(getInitialSlideLoadIndexes(3).includes(2), true);
  });
});

describe("autoplay gating", () => {
  it("does not advance before next slide is preloaded", () => {
    assert.equal(resolveAutoplaySlideIndex(0, 3, new Set([0]), new Set()), 0);
  });

  it("advances after next slide preload completes", () => {
    assert.equal(resolveAutoplaySlideIndex(0, 3, new Set([0, 1]), new Set()), 1);
    assert.equal(resolveAutoplaySlideIndex(2, 3, new Set([0, 1, 2]), new Set()), 0);
  });

  it("keeps the same autoplay interval constant", () => {
    assert.equal(SLIDER_AUTOPLAY_MS, 3000);
    assert.equal(SLIDER_FADE_MS, 1000);
  });
});

describe("mounted slide indexes", () => {
  it("mounts only active slide before next preload completes", () => {
    assert.deepEqual(getMountedSlideIndexes(0, 3, new Set([0]), new Set()), [0]);
  });

  it("mounts active and preloaded next for fade transitions", () => {
    assert.deepEqual(getMountedSlideIndexes(0, 3, new Set([0, 1]), new Set()), [0, 1]);
  });

  it("prunes to active + loaded next after fade", () => {
    assert.deepEqual(
      pruneMountedSlideIndexes(1, 3, new Set([0, 1, 2]), new Set(), [0, 1, 2]),
      [1, 2]
    );
  });
});

describe("slide error handling", () => {
  it("skips failed slides when choosing preload target", () => {
    assert.equal(getPreloadSlideIndex(0, 3, new Set([1])), 2);
  });

  it("moves active to the next valid slide after an error", () => {
    assert.equal(
      resolveActiveAfterSlideError(0, 3, new Set([2]), new Set([0, 1])),
      2
    );
  });

  it("does not advance autoplay onto failed slides", () => {
    assert.equal(resolveAutoplaySlideIndex(0, 3, new Set([0, 2]), new Set([1])), 2);
  });
});

describe("pending preload dedupe", () => {
  it("does not schedule duplicate preload work", () => {
    assert.equal(
      getPendingSlidePreloadIndex(3, 0, new Set([1]), new Set(), new Set()),
      null
    );
    assert.equal(
      getPendingSlidePreloadIndex(3, 0, new Set(), new Set(), new Set([1])),
      null
    );
  });

  it("does not preload when only one slide exists", () => {
    assert.equal(getPendingSlidePreloadIndex(1, 0, new Set(), new Set(), new Set()), null);
  });
});
