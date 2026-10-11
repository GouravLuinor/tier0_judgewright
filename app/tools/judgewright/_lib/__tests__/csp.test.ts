import { describe, expect, it } from "vitest";
import nextConfig from "../../../../../next.config";
import { DECLARED_ORIGINS } from "../constants";

/**
 * Static half of the zero-egress proof (AC-20): the SHIPPED CSP must never
 * allow an origin that is not in the documented DECLARED_ORIGINS list, and
 * every declared origin must be reachable from the header itself. The runtime
 * half lives in e2e/visual.spec.ts, which asserts the page only ever talks to
 * its own origin on the default path.
 */
async function securityHeaders() {
  const headers = await nextConfig.headers?.();
  return new Map(
    (headers ?? []).flatMap((entry) =>
      entry.headers.map((header) => [header.key, header.value] as const)
    )
  );
}

function connectSrcOrigins(csp: string): string[] {
  const directive = csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("connect-src"));
  if (!directive) throw new Error("CSP has no connect-src directive");
  return directive.split(/\s+/).slice(1);
}

/** The values of any directive, `"img-src"` included. */
function directiveValues(csp: string, name: string): string[] {
  const directive = csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `) || part === name);
  if (!directive) throw new Error(`CSP has no ${name} directive`);
  return directive.split(/\s+/).slice(1);
}

describe("shipped security headers", () => {
  it("carries the full verbatim header set", async () => {
    const headers = await securityHeaders();

    expect(headers.get("Content-Security-Policy")).toBeTruthy();
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin"
    );
    expect(headers.get("Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains; preload"
    );
    expect(headers.get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=()"
    );
  });

  it("declares no powered-by header and standalone output", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
    expect(nextConfig.output).toBe("standalone");
    expect(nextConfig.typescript?.ignoreBuildErrors).toBe(false);
  });

  it("locks the document to its own origin in every embed-capable surface", async () => {
    const headers = await securityHeaders();
    const csp = headers.get("Content-Security-Policy") ?? "";

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("worker-src 'self' blob:");
  });

  it("allows unsafe-eval in development only", async () => {
    const headers = await securityHeaders();
    const csp = headers.get("Content-Security-Policy") ?? "";
    const scriptSrc = csp
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("script-src"));

    expect(scriptSrc).toBeTruthy();
    if (process.env.NODE_ENV === "production") {
      expect(scriptSrc).not.toContain("unsafe-eval");
    } else {
      expect(scriptSrc).toContain("unsafe-eval");
    }
  });
});

/**
 * A7 — `img-src` is held to the SAME rule as `connect-src`: every value must
 * be a declared origin or one of the two inline schemes the UI itself
 * produces. The avatar hosts that used to sit here were undeclared AND unused
 * (nothing in the app requests them), so they were dropped; this block is what
 * stops one drifting back in — an allow-list entry nobody uses is an egress
 * path with no owner.
 */
describe("img-src vs DECLARED_ORIGINS (no undeclared image origin)", () => {
  /** The inline schemes `img-src` may carry beyond DECLARED_ORIGINS. */
  const IMG_SCHEMES = ["data:", "blob:"] as const;

  it("allows only declared origins and the inline schemes", async () => {
    const headers = await securityHeaders();
    const values = directiveValues(
      headers.get("Content-Security-Policy") ?? "",
      "img-src"
    );

    for (const value of values) {
      const allowed =
        DECLARED_ORIGINS.includes(value) ||
        (IMG_SCHEMES as readonly string[]).includes(value);
      expect(allowed, `undeclared img-src value: ${value}`).toBe(true);
    }
  });

  it("carries 'self' plus data: and blob:, and nothing else", async () => {
    const headers = await securityHeaders();
    const values = directiveValues(
      headers.get("Content-Security-Policy") ?? "",
      "img-src"
    );

    // 'self' is always present; the two schemes cover the data-URI icon and
    // the blob: object URL the download path creates.
    expect(values).toContain("'self'");
    expect(values).toContain("data:");
    expect(values).toContain("blob:");
    expect(values).toEqual(["'self'", "data:", "blob:"]);
  });

  it("never names an avatar / CDN host that is not in DECLARED_ORIGINS", async () => {
    const headers = await securityHeaders();
    const values = directiveValues(
      headers.get("Content-Security-Policy") ?? "",
      "img-src"
    );

    // The regression guard, stated as the subset relation it actually is:
    // every host-bearing value must be one of the DECLARED origins. The
    // avatar hosts that used to live here (googleusercontent, githubusercontent)
    // were never in DECLARED_ORIGINS and nothing fetches them, so the shipped
    // header now carries NO host at all — and this assertion is what keeps it
    // that way.
    const hosts = values.filter((value) => value.includes("://"));
    for (const host of hosts) {
      expect(DECLARED_ORIGINS, `undeclared img-src host: ${host}`).toContain(host);
    }
    // img-src ⊆ DECLARED_ORIGINS ∪ {data:, blob:}
    for (const value of values) {
      expect(
        DECLARED_ORIGINS.includes(value) || IMG_SCHEMES.includes(value as never),
        `img-src value outside DECLARED_ORIGINS ∪ schemes: ${value}`
      ).toBe(true);
    }
  });
});

describe("connect-src vs DECLARED_ORIGINS (the zero-egress contract)", () => {
  it("allows only origins on the documented list", async () => {
    const headers = await securityHeaders();
    const csp = headers.get("Content-Security-Policy") ?? "";
    const origins = connectSrcOrigins(csp);

    for (const origin of origins) {
      expect(
        DECLARED_ORIGINS,
        `undeclared connect-src origin: ${origin}`
      ).toContain(origin);
    }
  });

  it("documents every non-'self' origin it allows, with the optional flows named", async () => {
    const headers = await securityHeaders();
    const origins = connectSrcOrigins(
      headers.get("Content-Security-Policy") ?? ""
    );

    // 'self' is always present; the rest are user-initiated only.
    expect(origins).toContain("'self'");
    expect(origins).toContain("https://*.supabase.co");
    expect(origins).toContain("wss://*.supabase.co");
    expect(origins).toContain("https://openrouter.ai");
    // Nothing else — no CDN, no analytics, no fonts origin.
    expect(origins).toEqual([...DECLARED_ORIGINS]);
  });

  it("keeps the optional LLM endpoint armed only by a user-supplied key", async () => {
    // The BYOK diagnosis is never automatic: with no key the flow is a no-op
    // and the request guard observes nothing beyond the app origin.
    const { AUTO_DIAGNOSIS_ENABLED } = await import("../constants");
    expect(AUTO_DIAGNOSIS_ENABLED).toBe(false);
  });
});
