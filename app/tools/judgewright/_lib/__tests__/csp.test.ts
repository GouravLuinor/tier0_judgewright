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
