import { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

// Single source for the canonical base — layout.tsx `metadataBase`,
// app/sitemap.ts and this file all read it. Preview deploys override via
// NEXT_PUBLIC_SITE_URL.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? SITE.url;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
