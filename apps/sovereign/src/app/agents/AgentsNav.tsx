"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

const tabs: { href: string; label: string; value: string }[] = [
  { href: "/agents", label: "Roster", value: "roster" },
  { href: "/agents?tab=runtime", label: "Runtime & policy", value: "runtime" },
  { href: "/agents?tab=registry", label: "Registry & board", value: "registry" }
];

export function AgentsNav() {
  const searchParams = useSearchParams();
  const raw = searchParams.get("tab");
  const current =
    raw === "runtime" || raw === "registry" ? raw : "roster";

  return (
    <nav
      className="mb-8 flex flex-wrap gap-1 border-b border-white/[0.08] pb-4"
      aria-label="Agents sections"
    >
      {tabs.map((t) => {
        const active = t.value === current;
        return (
          <Link
            key={t.value}
            href={t.href}
            className={active ? "ds-nav-item-active" : "ds-nav-item"}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
