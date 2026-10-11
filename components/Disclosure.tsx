"use client";

import { useState, type ReactNode } from "react";

/**
 * "See how we worked this out": the proof, closed by default so the screen answers first. Native <details>, so it works
 * from the keyboard and with a screen reader. `lazy` keeps the content out of the page (and any AI call it would make)
 * until it is first opened. `open` / `onOpenChange` let another control, such as a "Compare other ways" link, open it.
 */
export default function Disclosure({
  title,
  hint,
  id,
  children,
  lazy = false,
  open,
  onOpenChange,
  className = "",
}: {
  title: string;
  hint?: string;
  id?: string;
  children: ReactNode;
  lazy?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const [own, setOwn] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const isOpen = open ?? own;
  const show = !lazy || isOpen || everOpened;
  return (
    <details
      id={id}
      open={isOpen}
      onToggle={(e) => {
        const next = e.currentTarget.open;
        setOwn(next);
        if (next) setEverOpened(true);
        onOpenChange?.(next);
      }}
      className={`group rounded-xl border border-line bg-card shadow-sm ${className}`}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-semibold marker:content-none">
        <span>
          {title}
          {hint && <span className="ml-2 font-normal text-muted">{hint}</span>}
        </span>
        <span aria-hidden className="text-muted transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      {show && <div className="border-t border-line px-5 py-4">{children}</div>}
    </details>
  );
}
