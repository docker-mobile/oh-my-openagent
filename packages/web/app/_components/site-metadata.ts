import type { Metadata, Viewport } from "next"
import { getStats, FALLBACK_DESCRIPTION } from "@/lib/stats"

const primarySiteUrl = "https://omc.nga.hm"

export async function generateSiteMetadata(): Promise<Metadata> {
  let description = FALLBACK_DESCRIPTION
  try {
    description = (await getStats()).description
  } catch (error) {
    console.warn("Unable to refresh site metadata; using fallback description", error)
  }

  return {
    metadataBase: new URL(primarySiteUrl),
    title: {
      default: "OmC: Your tool for real work. But it's an agent.",
      template: "%s | OmC",
    },
    description,
    keywords: [
      "opencode",
      "oh-my-cybersecurity",
      "openagent",
      "oh-my-cybersecurity",
      "ai agent",
      "code agent",
      "multi-model",
      "team mode",
      "agent orchestration",
      "claude",
      "gpt",
      "coding assistant",
      "lazycodex",
      "lazycodex-ai",
      "codex cli",
      "codex plugin",
    ],
    authors: [{ name: "Yeongyu Kim", url: "https://github.com/code-yeongyu" }],
    creator: "Yeongyu Kim",
    alternates: {
      canonical: "/",
      languages: {
        en: "/",
        ko: "/ko",
        ja: "/ja",
        zh: "/zh",
        es: "/es",
        fr: "/fr",
        de: "/de",
        "pt-BR": "/pt-BR",
        it: "/it",
      },
    },
    openGraph: {
      type: "website",
      locale: "en_US",
      alternateLocale: ["ko_KR", "ja_JP", "zh_CN", "es_ES", "fr_FR", "de_DE", "pt_BR", "it_IT"],
      url: primarySiteUrl,
      siteName: "OmC",
      title: "OmC: Your tool for real work. But it's an agent.",
      description,
      // Next.js supplies the dynamic image from app/opengraph-image.tsx.
    },
    twitter: {
      card: "summary_large_image",
      title: "OmC: Your tool for real work. But it's an agent.",
      description,
      // app/twitter-image.tsx shares the Open Graph image generator.
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
  }
}

export const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "OmC",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "macOS, Linux, Windows",
  url: primarySiteUrl,
  author: {
    "@type": "Person",
    name: "Yeongyu Kim",
    url: "https://github.com/code-yeongyu",
  },
  description:
    "The batteries-included agent harness for OpenCode. Multi-model orchestration, Team Mode, background agents, 55 lifecycle hooks.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
}

export const gaMeasurementId = "G-S0QJFKT46Q"
export const gaTrackedDomain = "omc.nga.hm"

/** Every page follows the system theme (or the one pinned by the home page switch), so it declares both schemes. */
export const siteViewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0e0d" },
  ],
}
