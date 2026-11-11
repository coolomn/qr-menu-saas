import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeCspReport } from "./csp-report";

describe("summarizeCspReport", () => {
  it("parses the legacy csp-report format and strips query strings", () => {
    const body = JSON.stringify({
      "csp-report": {
        "document-uri": "https://tapmenu.com.tr/menu/x?table=5",
        "violated-directive": "img-src",
        "effective-directive": "img-src",
        "blocked-uri": "https://evil.example/a.png?token=secret",
      },
    });
    assert.deepEqual(summarizeCspReport(body), [
      "img-src blocked=https://evil.example/a.png page=https://tapmenu.com.tr/menu/x",
    ]);
  });

  it("parses the Reporting API format", () => {
    const body = JSON.stringify([
      { type: "csp-violation", body: { effectiveDirective: "connect-src", blockedURL: "https://x.example/api", documentURL: "https://tapmenu.com.tr/admin" } },
    ]);
    assert.deepEqual(summarizeCspReport(body), ["connect-src blocked=https://x.example/api page=https://tapmenu.com.tr/admin"]);
  });

  it("ignores garbage and caps the number of lines", () => {
    assert.deepEqual(summarizeCspReport("not json"), []);
    assert.deepEqual(summarizeCspReport("{}"), []);
    const many = JSON.stringify(Array.from({ length: 50 }, () => ({ body: { effectiveDirective: "img-src" } })));
    assert.equal(summarizeCspReport(many).length, 10);
  });
});
