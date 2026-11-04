import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildContentSecurityPolicy, buildSecurityHeaderRules } from "./headers";

function headersFor(source: string) {
  const rule = buildSecurityHeaderRules({ supabaseUrl: "https://abc.supabase.co" }).find((r) => r.source === source);
  assert.ok(rule, `rule for ${source}`);
  return Object.fromEntries(rule.headers.map((h) => [h.key, h.value]));
}

describe("security headers", () => {
  it("sends safe headers on every page and CSP only in report-only mode", () => {
    const h = headersFor("/:path*");
    assert.equal(h["X-Content-Type-Options"], "nosniff");
    assert.equal(h["Referrer-Policy"], "strict-origin-when-cross-origin");
    assert.ok(h["Content-Security-Policy-Report-Only"]);
    assert.equal(h["Content-Security-Policy"], undefined, "global CSP must not be enforced yet");
    assert.equal(h["X-Frame-Options"], undefined, "public menu stays embeddable");
  });

  it("blocks framing of the admin panel", () => {
    const h = headersFor("/admin/:path*");
    assert.equal(h["X-Frame-Options"], "DENY");
    assert.equal(h["Content-Security-Policy"], "frame-ancestors 'none'");
  });

  it("allows the configured Supabase origin for images and API calls", () => {
    const csp = buildContentSecurityPolicy({ supabaseUrl: "https://custom.example.com/" });
    assert.match(csp, /img-src [^;]*https:\/\/custom\.example\.com/);
    assert.match(csp, /connect-src [^;]*https:\/\/custom\.example\.com/);
    assert.match(csp, /connect-src [^;]*wss:\/\/custom\.example\.com/);
    assert.match(csp, /connect-src [^;]*api\.mymemory\.translated\.net/);
  });

  it("only allows unsafe-eval in development", () => {
    assert.doesNotMatch(buildContentSecurityPolicy({}), /unsafe-eval/);
    assert.match(buildContentSecurityPolicy({ isDev: true }), /unsafe-eval/);
  });
});
