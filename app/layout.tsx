import type { Metadata } from "next";
import { Inter, TASA_Orbiter } from "next/font/google";
import "./globals.css";
import { JourneyProvider } from "@/components/JourneyProvider";
import NavLinks from "@/components/NavLinks";

// Blade's two font families, both free on Google Fonts: Inter for text, TASA Orbiter for headings.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const tasaOrbiter = TASA_Orbiter({
  variable: "--font-tasa-orbiter",
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
      className={`${inter.variable} ${tasaOrbiter.variable} h-full antialiased`}
    >
      <body className="flex min-h-screen flex-col bg-navy">
        <div role="note" className="bg-amber-100 px-4 py-1 text-center text-xs font-medium text-amber-800">
          Concept prototype. All merchant data is simulated.
        </div>
        <JourneyProvider>
          <header className="flex h-14 items-center gap-8 bg-navy px-6 text-white">
            <span className="font-heading text-base font-semibold">Cash Gap Advisor</span>
            <nav aria-label="Product" className="hidden gap-5 text-sm sm:flex">
              <span className="text-white/70">Home</span>
              <span className="border-b-2 border-brand pb-0.5 font-medium">Vendor Payments</span>
            </nav>
          </header>
          <div className="flex flex-1 flex-col bg-card md:flex-row md:rounded-t-xl">
            <aside className="border-b border-line bg-card md:w-56 md:shrink-0 md:border-b-0 md:border-r">
              <NavLinks />
            </aside>
            <main className="flex-1 bg-background p-6 md:p-8">
              <div className="mx-auto max-w-5xl">{children}</div>
            </main>
          </div>
          <footer className="border-t border-line bg-card px-6 py-3 text-center text-xs text-muted">
            Concept prototype for the Razorpay x ISB challenge
          </footer>
        </JourneyProvider>
      </body>
    </html>
  );
}
