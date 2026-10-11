import { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

// Same canonical base as layout.tsx metadataBase and app/robots.ts.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? SITE.url;

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1.0,
      alternates: { languages: { "x-default": SITE_URL } },
    },
    {
      url: `${SITE_URL}/tools/judgewright`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
      alternates: { languages: { "x-default": `${SITE_URL}/tools/judgewright` } },
    },
  ];
}
