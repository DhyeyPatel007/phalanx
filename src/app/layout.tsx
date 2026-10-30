import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PHALANX — PayPal dispute-defense swarm",
  description:
    "Adversarial dispute-defense workbench for a small PayPal merchant. Checklist scores are an internal heuristic, not a win probability. Sandbox only.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
