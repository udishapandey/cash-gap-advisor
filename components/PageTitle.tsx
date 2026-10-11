"use client";

import { usePathname } from "next/navigation";

const TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/invoice": "Step 1: Invoice",
  "/gap": "Step 2: Cash gap",
  "/options": "Step 3: Options",
  "/approve": "Step 4: Approve",
};

export default function PageTitle() {
  const pathname = usePathname();
  return <h1 className="text-base font-semibold">{TITLES[pathname] ?? "Cash Gap Advisor"}</h1>;
}
