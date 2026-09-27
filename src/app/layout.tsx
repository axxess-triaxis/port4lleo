import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "PORT4LEO", template: "%s · PORT4LEO" },
  description: "Turn your GitHub into a builder portfolio: what you shipped, how you ship, and a transparent Builder Score.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="border-b border-line bg-surface">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span aria-hidden className="inline-block h-5 w-5 rounded-md bg-accent" />
              PORT4LEO
            </Link>
            <div className="flex items-center gap-3 text-sm text-ink-2 sm:gap-4">
              <Link href="/u/demo" className="hover:text-ink">
                Demo
              </Link>
              <Link href="/scoring" className="hover:text-ink">
                <span className="hidden sm:inline">How scoring works</span>
                <span className="sm:hidden">Scoring</span>
              </Link>
              <Link href="/dashboard" className="rounded-lg bg-ink px-3 py-1.5 font-medium text-bg hover:opacity-90">
                Dashboard
              </Link>
            </div>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line py-6 text-center text-xs text-ink-3">
          Open source (MIT). Metrics come from the GitHub API; anything inferred is labelled as such.
        </footer>
      </body>
    </html>
  );
}
