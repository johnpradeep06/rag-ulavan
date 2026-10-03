import type { Metadata } from "next";
import { Hanken_Grotesk, Geist_Mono, Playfair_Display, Space_Mono } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "../i18n";

// Readable grotesque in the spirit of Perplexity's FK Grotesk — open apertures,
// comfortable at reading sizes. Fills foundation's --font-inter slot.
const bodyFont = Hanken_Grotesk({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-mono-face",
  subsets: ["latin"],
  display: "swap",
});

// Editorial display serif — Playfair Display for cinematic headlines
const playfairDisplay = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

// Space Mono for coordinate tags and data readouts
const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "RAG Uzhavan — Region-Aware Farm Advisory",
  description:
    "A region-aware agricultural decision-support system. Get cited, location-specific farming advice grounded in official public data — and a clear refusal when reliable local data is unavailable.",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${bodyFont.variable} ${geistMono.variable} ${playfairDisplay.variable} ${spaceMono.variable}`}>
      <body className="antialiased">
        <LanguageProvider>
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
