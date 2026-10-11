import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NavLinks from "@/components/NavLinks";
import PageTitle from "@/components/PageTitle";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cash Gap Advisor",
  description: "Concept prototype for the Razorpay x ISB challenge",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex">
        <aside className="hidden md:flex w-60 shrink-0 flex-col bg-navy text-white">
          <div className="px-6 py-6 text-lg font-semibold tracking-tight">
            Cash Gap Advisor
          </div>
          <NavLinks />
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-line bg-card px-6 py-4">
            <PageTitle />
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
              Simulated data
            </span>
          </header>
          <main className="flex-1 p-6">{children}</main>
          <footer className="border-t border-line bg-card px-6 py-4 text-center text-xs text-muted">
            Concept prototype for the Razorpay x ISB challenge
          </footer>
        </div>
      </body>
    </html>
  );
}
