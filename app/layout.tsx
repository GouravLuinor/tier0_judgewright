import type { Metadata, Viewport } from "next";
import { type ReactNode } from "react";
import { Archivo, Fragment_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./tools/judgewright/_components/providers/ThemeProvider";
import { SITE } from "@/lib/site";

const archivo = Archivo({
  subsets: ["latin"],
  display: "swap",
  axes: ["wdth"],
  variable: "--font-archivo",
});

const fragmentMono = Fragment_Mono({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-fragment-mono",
});

// Single canonical origin: NEXT_PUBLIC_SITE_URL is authoritative (.env.example).
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? SITE.url;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${SITE.title} · ${SITE.name}`,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  keywords: [...SITE.keywords],
  applicationName: SITE.name,
  authors: [{ name: "Nor AI", url: "https://norai.tech" }],
  creator: SITE.creator,
  alternates: { canonical: "/tools/judgewright" },
  robots: { index: true, follow: true },
  openGraph: {
    title: `${SITE.title} · ${SITE.name}`,
    description: SITE.description,
    type: "website",
    url: "/tools/judgewright",
    siteName: SITE.name,
    locale: SITE.locale,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.title} · ${SITE.name}`,
    description: SITE.description,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1e1e1d" },
    { media: "(prefers-color-scheme: dark)", color: "#090909" },
  ],
  colorScheme: "light dark",
};

// WebApplication structured data. The FAQPage block lives beside the FAQ it
// is derived from (FaqSection), so each stays next to its own source.
const webApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE.name,
  url: `${siteUrl}/tools/judgewright`,
  description: SITE.description,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Any (runs in the browser)",
  browserRequirements: "Requires JavaScript and Web Workers",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: [
    "Cohen's kappa with a seeded bootstrap confidence interval",
    "Krippendorff's alpha and the humans-only ceiling",
    "Always-majority chance baseline and raw-agreement deflation",
    "Confusion matrix and per-example disagreement inspector",
    "ECE and Brier score from judge scores",
    "Markdown, one-line and JSONL exports with a reproducibility receipt",
  ],
  creator: { "@type": "Organization", name: "Nor AI", url: "https://norai.tech" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${archivo.variable} ${fragmentMono.variable}`}
    >
      <body className="min-h-screen bg-ground font-sans text-ink antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webApplicationJsonLd) }}
        />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
