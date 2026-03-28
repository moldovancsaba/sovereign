"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections: { href: string; label: string; overview?: boolean }[] = [
  { href: "/settings", label: "Overview", overview: true },
  { href: "/settings/workspace", label: "Workspace" },
  { href: "/settings/preferences", label: "Preferences" },
  { href: "/settings/safety", label: "Safety & tools" },
  { href: "/settings/about", label: "About" }
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav
      className="mb-8 flex flex-wrap gap-1 border-b border-white/[0.08] pb-4"
      aria-label="Settings sections"
    >
      {sections.map(({ href, label, overview }) => {
        const active = overview ? pathname === "/settings" : pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={
              active
                ? "ds-nav-item-active"
                : "ds-nav-item"
            }
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
