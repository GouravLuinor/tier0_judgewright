import type { Metadata, Viewport } from "next";
import { type ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./tools/judgewright/_components/providers/ThemeProvider";
import { SITE } from "@/lib/site";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

// Single canonical origin — NEXT_PUBLIC_SITE_URL is authoritative (.env.example).
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? SITE.url;

const description = SITE.description;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: SITE.title,
    template: `%s · ${SITE.name}`,
  },
  description,
  keywords: [...SITE.keywords],
  applicationName: SITE.name,
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: SITE.title,
    description,
    type: "website",
    url: "/",
    siteName: SITE.name,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.title,
    description,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0e0b" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased selection:bg-brand-lime/25">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
