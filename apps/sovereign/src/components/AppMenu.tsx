"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const itemClass =
  "block rounded-lg px-3 py-2 text-sm text-white/85 outline-none transition hover:bg-white/[0.08] focus-visible:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-white/25";

export function AppMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (open) {
      queueMicrotask(() => firstItemRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        className="ds-nav-item flex items-center gap-1.5"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="sovereign-app-menu"
        aria-label="App menu: agents, products, run, settings"
        id="sovereign-app-menu-trigger"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-medium">Menu</span>
        <span className="text-[10px] text-white/50" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div
          id="sovereign-app-menu"
          role="menu"
          aria-labelledby="sovereign-app-menu-trigger"
          className="ds-card absolute right-0 top-full z-50 mt-2 min-w-[13.5rem] py-2 shadow-[0_16px_48px_rgba(0,0,0,0.45)]"
        >
          <Link
            ref={firstItemRef}
            href="/dashboard"
            role="menuitem"
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            Control Room
          </Link>
          <Link href="/agents" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
            Agent Roles
          </Link>
          <div
            className="my-2 border-t border-white/[0.08]"
            role="separator"
            aria-orientation="horizontal"
          />
          <Link href="/settings" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
            Settings
          </Link>
        </div>
      ) : null}
    </div>
  );
}
