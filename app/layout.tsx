import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EWA Onchain Records",
  description:
    "On-chain analytics for tokenized real-world assets — perp OI/funding/skew and spot-token premium across public venues.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
