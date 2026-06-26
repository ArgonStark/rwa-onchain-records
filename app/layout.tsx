import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://rwa-onchain-records.vercel.app";

const DESCRIPTION =
  "Cross-venue on-chain analytics for tokenized real-world assets. Track perp open interest, funding rates, spot-token premiums, and perp–spot basis across Hyperliquid, Ostium, dYdX, and more — public data only.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "RWA Onchain Records",
    template: "%s | RWA Onchain Records",
  },
  description: DESCRIPTION,
  keywords: [
    "RWA", "real world assets", "on-chain analytics", "DeFi", "perp",
    "open interest", "funding rate", "tokenized assets", "gold", "equities",
    "forex", "Hyperliquid", "Ostium", "dYdX", "basis", "spot premium",
    "crypto analytics", "perp OI",
  ],
  authors: [{ name: "RWA Onchain Records", url: SITE_URL }],
  creator: "@0xargonstark",
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "RWA Onchain Records",
    title: "RWA Onchain Records",
    description: DESCRIPTION,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "RWA Onchain Records — on-chain analytics for tokenized real-world assets",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@0xargonstark",
    creator: "@0xargonstark",
    title: "RWA Onchain Records",
    description: DESCRIPTION,
    images: ["/opengraph-image"],
  },
  robots: { index: true, follow: true },
  icons: { icon: "/logo.svg" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} min-h-screen antialiased`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  );
}
