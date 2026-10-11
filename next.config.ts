import type { NextConfig } from "next";
import { DECLARED_ORIGINS } from "./app/tools/judgewright/_lib/constants";

// Production runs the standalone build (`node server.js` from
// .next/standalone) under PM2 as `judge-norai` on port 3005, reverse-proxied
// to judge.norai.tech — output:"standalone" keeps that PM2/Docker package
// self-contained (bundled deps, no repo-wide deploy).

// CSP is the privacy moat in transport form: the app is fully client-side, so
// every allowed origin here is one fewer egress path a payload could take.
// connect-src is built from DECLARED_ORIGINS (the single documented list) —
// 'self' plus the two optional flows, both user-initiated only:
//   · Supabase hosts: optional OAuth (unset env keys → zero connections)
//   · openrouter.ai: the ONE opt-in BYOK diagnosis call, never automatic
// The default path therefore contacts nothing beyond its own origin, and the
// e2e request guard (AC-20) proves it by failing on any non-localhost request.
// - googleusercontent / githubusercontent exist solely to render OAuth
//   provider avatars.
// - unsafe-inline styles are required by Next's runtime CSS and the
//   next-themes no-flash boot script.
// - worker-src covers the compute Web Worker pipeline (same-origin chunks;
//   blob: tolerates blob-URL workers in dev).
const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  // Next.js bootstraps with an inline script; HMR in dev additionally needs
  // eval. Production carries inline-only.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.googleusercontent.com https://avatars.githubusercontent.com https://*.githubusercontent.com",
  "font-src 'self' data:",
  `connect-src ${DECLARED_ORIGINS.join(" ")}`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Don't advertise the framework; a client-only workstation gains nothing
  // from the X-Powered-By fingerprint.
  poweredByHeader: false,
  typescript: {
    ignoreBuildErrors: false,
  },
  async headers() {
    // One security posture for everything, HTML and static assets alike.
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
