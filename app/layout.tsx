import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Cash Gap Advisor",
  description: "Concept prototype for the Razorpay x ISB challenge",
};

const NAV = ["Dashboard", "Payments", "Settlements", "Cash Gap"];

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
          <nav className="flex flex-col gap-1 px-3">
            {NAV.map((item, i) => (
              <span
                key={item}
                className={`rounded-md px-3 py-2 text-sm ${
                  i === 0 ? "bg-white/10 font-medium" : "text-white/70"
                }`}
              >
                {item}
              </span>
            ))}
          </nav>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-line bg-card px-6 py-4">
            <h1 className="text-base font-semibold">Dashboard</h1>
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
