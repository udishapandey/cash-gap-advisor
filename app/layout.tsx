import type { Metadata } from "next";
import { Inter, TASA_Orbiter } from "next/font/google";
import "./globals.css";
import { JourneyProvider } from "@/components/JourneyProvider";
import NavLinks from "@/components/NavLinks";
import PageTitle from "@/components/PageTitle";

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
      <body className="flex min-h-full flex-col">
        <div role="note" className="bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-800">
          Concept prototype · all merchant data is simulated
        </div>
        <JourneyProvider>
          <div className="flex flex-1">
            <aside className="hidden md:flex w-60 shrink-0 flex-col bg-navy text-white">
              <div className="px-6 py-6 font-heading text-lg font-semibold tracking-tight">
                Cash Gap Advisor
              </div>
              <NavLinks />
            </aside>

            <div className="flex min-h-full flex-1 flex-col">
              <header className="flex items-center justify-between border-b border-line bg-card px-6 py-4">
                <PageTitle />
              </header>
              <main className="flex-1 p-6">{children}</main>
              <footer className="border-t border-line bg-card px-6 py-4 text-center text-xs text-muted">
                Concept prototype for the Razorpay x ISB challenge
              </footer>
            </div>
          </div>
        </JourneyProvider>
      </body>
    </html>
  );
}
