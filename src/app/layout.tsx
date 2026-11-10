import type { Metadata } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// New theme (Nov 11, 2026): Inter editorial sans + JetBrains Mono for
// dispute IDs, amounts, hashes, timestamps and scores.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  fallback: [
    "-apple-system",
    "BlinkMacSystemFont",
    "Segoe UI",
    "Roboto",
    "Helvetica Neue",
    "sans-serif",
  ],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  fallback: [
    "ui-monospace",
    "SFMono-Regular",
    "Menlo",
    "Monaco",
    "Consolas",
    "monospace",
  ],
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
  fallback: ["Georgia", "'Times New Roman'", "serif"],
});

// Premium foundations (Nov 11, 2026): Instrument Serif italic is for
// display accent words only (e.g. "Hallucinated" in "Zero Hallucinated
// Verdicts"), never body text.

export const metadata: Metadata = {
  metadataBase: new URL("https://phalanx.krynex.in"),
  title: "PHALANX — Adversarial Dispute Defense for PayPal Merchants",
  description:
    "Open-source multi-agent dispute workbench for small PayPal merchants. Deterministic checklist scoring, 3-juror deliberation, and mandatory human approval.",
  openGraph: {
    title: "PHALANX — Adversarial Dispute Defense for PayPal Merchants",
    description:
      "Open-source multi-agent dispute workbench for small PayPal merchants. Deterministic checklist scoring, 3-juror deliberation, and mandatory human approval.",
    url: "https://phalanx.krynex.in",
    siteName: "PHALANX",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "PHALANX — Adversarial Dispute Defense for PayPal Merchants",
    description:
      "Open-source multi-agent dispute workbench for small PayPal merchants. Deterministic checklist scoring, 3-juror deliberation, and mandatory human approval.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable}`}
    >
      <body className="light-theme">{children}</body>
    </html>
  );
}
