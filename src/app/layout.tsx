import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Cerberus CI — AI-Powered Test Health & Performance Gate",
    template: "%s | Cerberus CI",
  },
  description:
    "Cerberus watches your CI test history, classifies failures as flaky vs. real regressions, catches performance regressions, and posts a plain-English quality report on every pull request.",
  keywords: [
    "CI",
    "testing",
    "flaky tests",
    "performance regression",
    "GitHub Actions",
    "AI",
    "quality gate",
    "Playwright",
    "JUnit",
  ],
  authors: [{ name: "EvertonSt" }],
  creator: "EvertonSt",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://cerberus-ci.dev",
    siteName: "Cerberus CI",
    title: "Cerberus CI — AI-Powered Test Health & Performance Gate",
    description:
      "Classify flaky tests vs. real regressions. Catch performance regressions. Post plain-English quality reports on every PR.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cerberus CI",
    description: "AI-powered test-health and performance-regression gate for CI pipelines.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#030712",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen flex flex-col bg-dark-950 text-white antialiased">
        {/* Skip to content — accessibility */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-purple-600 focus:text-white focus:outline-none focus:ring-2 focus:ring-purple-400"
        >
          Skip to content
        </a>

        <Header />

        <main id="main-content" className="flex-1 pt-16" role="main">
          {children}
        </main>

        <Footer />
      </body>
    </html>
  );
}
