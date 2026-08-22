import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_WELCOME_BACKGROUND_URL,
  resolveWelcomeBackgroundSrc,
} from "./welcome-background";

describe("resolveWelcomeBackgroundSrc", () => {
  it("returns trimmed custom URL when provided", () => {
    assert.equal(
      resolveWelcomeBackgroundSrc("  https://cdn.example/bg.webp  "),
      "https://cdn.example/bg.webp"
    );
  });

  it("falls back to default Unsplash when empty", () => {
    assert.equal(resolveWelcomeBackgroundSrc(null), DEFAULT_WELCOME_BACKGROUND_URL);
    assert.equal(resolveWelcomeBackgroundSrc(""), DEFAULT_WELCOME_BACKGROUND_URL);
    assert.equal(resolveWelcomeBackgroundSrc("   "), DEFAULT_WELCOME_BACKGROUND_URL);
  });

  it("uses a lighter default width than the legacy 1934px fallback", () => {
    assert.match(DEFAULT_WELCOME_BACKGROUND_URL, /w=1280/);
    assert.doesNotMatch(DEFAULT_WELCOME_BACKGROUND_URL, /w=1934/);
  });
});
