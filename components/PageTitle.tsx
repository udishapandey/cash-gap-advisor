"use client";

import { usePathname } from "next/navigation";

const TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/invoice": "Upload invoice",
};

export default function PageTitle() {
  const pathname = usePathname();
  return <h1 className="text-base font-semibold">{TITLES[pathname] ?? "Cash Gap Advisor"}</h1>;
}
