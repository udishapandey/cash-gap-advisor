"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { STEPS } from "@/lib/journey";

const JOURNEY_PATHS: string[] = STEPS.map((s) => s.href);

/** The sidebar: Home and Supplier bills. Every page of the bill journey keeps "Supplier bills" lit. */
export default function NavLinks() {
  const pathname = usePathname();
  const items = [
    { href: "/", label: "Home", active: pathname === "/" },
    { href: "/invoice", label: "Supplier bills", active: JOURNEY_PATHS.includes(pathname) },
  ];
  return (
    <nav className="flex gap-1 p-3 md:flex-col md:p-4" aria-label="Main">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={i.active ? "page" : undefined}
          className={`rounded-md border-l-2 px-3 py-2 text-sm ${
            i.active ? "border-brand bg-brand-faded font-semibold text-brand-text" : "border-transparent text-subtle hover:bg-background"
          }`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
