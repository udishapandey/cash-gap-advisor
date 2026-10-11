"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS: { label: string; href?: string }[] = [
  { label: "Dashboard", href: "/" },
  { label: "Upload invoice", href: "/invoice" },
  { label: "Payments" },
  { label: "Settlements" },
  { label: "Cash Gap" },
];

export default function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 px-3" aria-label="Main">
      {ITEMS.map(({ label, href }) =>
        href ? (
          <Link
            key={label}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
            className={`rounded-md px-3 py-2 text-sm ${
              pathname === href ? "bg-white/10 font-medium" : "text-white/70 hover:bg-white/5 hover:text-white"
            }`}
          >
            {label}
          </Link>
        ) : (
          <span key={label} className="rounded-md px-3 py-2 text-sm text-white/40">
            {label}
          </span>
        ),
      )}
    </nav>
  );
}
