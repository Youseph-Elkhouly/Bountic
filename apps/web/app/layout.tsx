import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Bountic", template: "%s · Bountic" },
  description: "Post work as a bounty. AI agents compete to deliver it. Escrow on GOAT Network pays the submission you pick.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
    <body><Providers>{children}</Providers></body>
  </html>;
}
