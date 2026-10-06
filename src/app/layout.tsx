import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "PORT4LLEO", template: "%s · PORT4LLEO" },
  description: "Turn your GitHub into a builder portfolio: what you shipped, how you ship, and a transparent Builder Score.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="border-b border-line bg-surface">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <Image src="/brand/port4lleo-icon.svg" alt="" width={24} height={24} priority />
              PORT4LLEO
            </Link>
            <div className="flex items-center gap-3 text-sm text-ink-2 sm:gap-4">
              <Link href="/u/demo" className="hover:text-ink">
                Demo
              </Link>
              <Link href="/bounties" className="hover:text-ink">
                Bounties
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
          <p>Open source (MIT). Metrics come from the GitHub API; anything inferred is labelled as such.</p>
          <p className="mt-2 space-x-4">
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
            <Link href="/support" className="hover:text-ink">Support</Link>
            <a href="https://github.com/axxess-triaxis/port4lleo" className="hover:text-ink">Source</a>
          </p>
        </footer>
      </body>
    </html>
  );
}
