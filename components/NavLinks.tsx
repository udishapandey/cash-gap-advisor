"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The sidebar is just the app name (in the layout) and a way home. The journey's own stepper is at the top of each screen. */
export default function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 px-3" aria-label="Main">
      <Link
        href="/"
        aria-current={pathname === "/" ? "page" : undefined}
        className={`rounded-md px-3 py-2 text-sm ${pathname === "/" ? "bg-white/10 font-medium" : "text-white/70 hover:bg-white/5 hover:text-white"}`}
      >
        Dashboard
      </Link>
    </nav>
  );
}
