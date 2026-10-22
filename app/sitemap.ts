import { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

// Same canonical base as layout.tsx metadataBase and app/robots.ts. The root
// redirects into the tool, so the tool route is the one canonical page.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? SITE.url;

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/tools/judgewright`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1.0,
    },
  ];
}
