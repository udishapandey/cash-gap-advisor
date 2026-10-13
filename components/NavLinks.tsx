"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { STEPS } from "@/lib/journey";

const JOURNEY_PATHS: string[] = STEPS.map((s) => s.href);

/** The sidebar: Home, then Vendor Payments with Supplier bills. Every page of the bill journey keeps "Supplier bills" lit. */
export default function NavLinks() {
  const pathname = usePathname();
  const items = [
    { href: "/", label: "Home", active: pathname === "/" },
    { href: "/invoice", label: "Supplier bills", active: JOURNEY_PATHS.includes(pathname) },
  ];
  const link = (i: (typeof items)[number]) => (
    <Link
      key={i.href}
      href={i.href}
      aria-current={i.active ? "page" : undefined}
      className={`block rounded-md px-3 py-2 text-sm ${i.active ? "bg-slate-50 font-semibold text-foreground" : "text-subtle hover:bg-background"}`}
    >
      {i.label}
    </Link>
  );
  return (
    <nav className="flex gap-1 p-3 md:flex-col md:p-4" aria-label="Main">
      {link(items[0])}
      <p className="hidden px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-muted md:block">Vendor Payments</p>
      {link(items[1])}
    </nav>
  );
}
