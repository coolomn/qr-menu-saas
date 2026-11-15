import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getClientIpFromHeaders,
  isPlausibleIp,
  isSecretApiKey,
  resolveServerSignInConfig,
  signInWithPasswordOnServer,
  type ServerSignInConfig,
} from "./server-password-sign-in";

const URL = "https://example.supabase.co";

function fakeFetch(status: number, body: unknown, seen?: { url?: string; init?: RequestInit }) {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    if (seen) {
      seen.url = String(url);
      seen.init = init;
    }
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as typeof fetch;
}

const secretConfig: ServerSignInConfig = {
  supabaseUrl: URL,
  apiKey: "sb_secret_abc",
  forwardClientIp: true,
};
const anonConfig: ServerSignInConfig = {
  supabaseUrl: URL + "/",
  apiKey: "eyJanon",
  forwardClientIp: false,
};
const creds = { email: "owner@example.com", password: "hunter22" };

describe("resolveServerSignInConfig", () => {
  it("prefers an sb_secret_ key and enables IP forwarding", () => {
    const config = resolveServerSignInConfig({
      NEXT_PUBLIC_SUPABASE_URL: URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJanon",
      SUPABASE_SECRET_KEY: " sb_secret_abc ",
    });
    assert.deepEqual(config, { supabaseUrl: URL, apiKey: "sb_secret_abc", forwardClientIp: true });
  });

  it("falls back to the anon key without forwarding when no secret key", () => {
    const config = resolveServerSignInConfig({
      NEXT_PUBLIC_SUPABASE_URL: URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJanon",
    });
    assert.deepEqual(config, { supabaseUrl: URL, apiKey: "eyJanon", forwardClientIp: false });
  });

  it("ignores a legacy service_role JWT put into SUPABASE_SECRET_KEY", () => {
    const config = resolveServerSignInConfig({
      NEXT_PUBLIC_SUPABASE_URL: URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJanon",
      SUPABASE_SECRET_KEY: "eyJserviceRole",
    });
    assert.equal(config?.forwardClientIp, false);
    assert.equal(config?.apiKey, "eyJanon");
  });

  it("returns null when URL or any key is missing", () => {
    assert.equal(resolveServerSignInConfig({ NEXT_PUBLIC_SUPABASE_ANON_KEY: "x" }), null);
    assert.equal(resolveServerSignInConfig({ NEXT_PUBLIC_SUPABASE_URL: URL }), null);
  });
});

describe("isSecretApiKey / isPlausibleIp", () => {
  it("detects secret keys", () => {
    assert.equal(isSecretApiKey("sb_secret_x"), true);
    assert.equal(isSecretApiKey("sb_publishable_x"), false);
    assert.equal(isSecretApiKey(undefined), false);
  });

  it("accepts IPv4/IPv6 and rejects junk", () => {
    assert.equal(isPlausibleIp("203.0.113.9"), true);
    assert.equal(isPlausibleIp("2001:db8::1"), true);
    assert.equal(isPlausibleIp("unknown"), false);
    assert.equal(isPlausibleIp("1.2.3.4\r\nX-Evil: 1"), false);
    assert.equal(isPlausibleIp(""), false);
  });
});

describe("getClientIpFromHeaders", () => {
  it("uses the first x-forwarded-for entry", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
    assert.equal(getClientIpFromHeaders(headers), "203.0.113.9");
  });

  it("falls back to x-real-ip, then null", () => {
    assert.equal(getClientIpFromHeaders(new Headers({ "x-real-ip": "198.51.100.2" })), "198.51.100.2");
    assert.equal(getClientIpFromHeaders(new Headers()), null);
  });
});

describe("signInWithPasswordOnServer", () => {
  it("returns only the tokens on success and calls the password grant endpoint", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    const result = await signInWithPasswordOnServer(
      secretConfig,
      creds,
      "203.0.113.9",
      fakeFetch(
        200,
        { access_token: "at", refresh_token: "rt", user: { email: "owner@example.com" } },
        seen
      )
    );
    assert.deepEqual(result, { ok: true, session: { access_token: "at", refresh_token: "rt" } });
    assert.equal(seen.url, `${URL}/auth/v1/token?grant_type=password`);
    const headers = seen.init?.headers as Record<string, string>;
    assert.equal(headers.apikey, "sb_secret_abc");
    assert.equal(headers["Sb-Forwarded-For"], "203.0.113.9");
    assert.equal(headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(String(seen.init?.body)), creds);
  });

  it("does not forward the IP with the anon key and trims trailing slash", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    await signInWithPasswordOnServer(
      anonConfig,
      creds,
      "203.0.113.9",
      fakeFetch(200, { access_token: "at", refresh_token: "rt" }, seen)
    );
    assert.equal(seen.url, `${URL}/auth/v1/token?grant_type=password`);
    assert.equal((seen.init?.headers as Record<string, string>)["Sb-Forwarded-For"], undefined);
  });

  it("does not forward an implausible IP", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    await signInWithPasswordOnServer(
      secretConfig,
      creds,
      "unknown",
      fakeFetch(200, { access_token: "at", refresh_token: "rt" }, seen)
    );
    assert.equal((seen.init?.headers as Record<string, string>)["Sb-Forwarded-For"], undefined);
  });

  it("maps 400 to invalid_credentials", async () => {
    const result = await signInWithPasswordOnServer(
      secretConfig,
      creds,
      null,
      fakeFetch(400, { code: "invalid_credentials" })
    );
    assert.deepEqual(result, { ok: false, reason: "invalid_credentials" });
  });

  it("maps 429 to rate_limited and 5xx / network / bad body to unavailable", async () => {
    assert.deepEqual(
      await signInWithPasswordOnServer(secretConfig, creds, null, fakeFetch(429, {})),
      { ok: false, reason: "rate_limited" }
    );
    assert.deepEqual(
      await signInWithPasswordOnServer(secretConfig, creds, null, fakeFetch(502, {})),
      { ok: false, reason: "unavailable" }
    );
    assert.deepEqual(
      await signInWithPasswordOnServer(secretConfig, creds, null, (async () => {
        throw new Error("network");
      }) as typeof fetch),
      { ok: false, reason: "unavailable" }
    );
    assert.deepEqual(
      await signInWithPasswordOnServer(secretConfig, creds, null, fakeFetch(200, "not json")),
      { ok: false, reason: "unavailable" }
    );
    assert.deepEqual(
      await signInWithPasswordOnServer(secretConfig, creds, null, fakeFetch(200, { access_token: "at" })),
      { ok: false, reason: "unavailable" }
    );
  });
});
